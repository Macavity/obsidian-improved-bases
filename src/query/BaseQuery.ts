import { App, EventRef, Plugin, TAbstractFile, TFile } from "obsidian";
import { cliQuery, cliQueryAvailable } from "../internals/cliQuery";
import { BaseNotFoundError, ViewNotFoundError, registerCollector } from "./CollectorView";
import { QueryTarget, targetKey } from "./target";

export interface BaseQuery {
	/** cb fires with the current result after the first scan and on every change (deduplicated); `failed` marks the `[]` of a failed scan. */
	watch(target: QueryTarget, cb: Listener): () => void;
	dispose(): void;
}

/** The first result of a target, or null when its scan failed; the watch ends either way. */
export function firstResult(query: BaseQuery, target: QueryTarget): Promise<TFile[] | null> {
	return new Promise((resolve) => {
		let done = false;
		const stop = query.watch(target, (files, failed) => {
			if (done) return;
			done = true;
			// A cached result arrives inside `watch`, before `stop` is assigned.
			queueMicrotask(() => stop());
			resolve(failed ? null : files);
		});
	});
}

export type MountCollector = (target: QueryTarget, push: (files: TFile[]) => void) => Promise<() => void>;
type CliRunner = (target: QueryTarget) => Promise<TFile[]>;

export interface BaseQueryDeps {
	mount?: MountCollector;
	/** CLI fallback; undefined = internal base:query handler when available, null = no fallback. */
	cli?: CliRunner | null;
}

const CLI_DEBOUNCE_MS = 200;

type Listener = (files: TFile[], failed: boolean) => void;

interface Entry {
	target: QueryTarget;
	/** targetKey(target), for logs and the entries map. */
	key: string;
	listeners: Set<Listener>;
	last: TFile[] | null;
	failed: boolean;
	/** Bumped on every (re)mount and unmount; async results from older generations are dropped. */
	gen: number;
	mounted: boolean;
	unmount: (() => void) | null;
	mode: "collector" | "cli";
	cliTimer: number | null;
}

function samePaths(a: TFile[] | null, b: TFile[]): boolean {
	return a !== null && a.length === b.length && a.every((f, i) => f.path === b[i]?.path);
}

export function createBaseQuery(plugin: Plugin, deps: BaseQueryDeps = {}): BaseQuery {
	const app = (plugin as { app?: App }).app;
	const mount = deps.mount ?? registerCollector(plugin);
	const entries = new Map<string, Entry>();
	const refs: Array<{ off: () => void }> = [];

	const cliRunner = (): CliRunner | null => {
		if (deps.cli !== undefined) return deps.cli;
		return app && cliQueryAvailable(app) ? (p) => cliQuery(app, p) : null;
	};

	const emit = (e: Entry, files: TFile[], failed = false) => {
		if (samePaths(e.last, files) && e.failed === failed) return;
		e.last = files;
		e.failed = failed;
		for (const cb of [...e.listeners]) {
			try {
				cb(files, failed);
			} catch (err) {
				console.error(`Improved Bases: listener for ${e.key} failed`, err);
			}
		}
	};

	const clearTimers = (e: Entry) => {
		if (e.cliTimer !== null) window.clearTimeout(e.cliTimer);
		e.cliTimer = null;
	};

	const runCli = (e: Entry) => {
		const cli = cliRunner();
		if (!cli) return;
		const gen = e.gen;
		cli(e.target).then(
			(files) => gen === e.gen && e.mode === "cli" && emit(e, files),
			(err: unknown) => {
				if (gen !== e.gen || e.mode !== "cli") return;
				console.warn(`Improved Bases: CLI query failed for ${e.key}`, err);
				emit(e, [], true);
			},
		);
	};

	const scheduleCli = (e: Entry) => {
		if (e.cliTimer !== null) window.clearTimeout(e.cliTimer);
		e.cliTimer = window.setTimeout(() => {
			e.cliTimer = null;
			runCli(e);
		}, CLI_DEBOUNCE_MS);
	};

	const unmountEntry = (e: Entry) => {
		e.gen++;
		clearTimers(e);
		e.mounted = false;
		e.mode = "collector";
		e.unmount?.();
		e.unmount = null;
	};

	const mountEntry = (e: Entry) => {
		unmountEntry(e);
		const gen = e.gen;
		e.mounted = true;
		// First scan starts right away via CLI (the collector can stall in hidden windows); the first collector push takes over.
		if (cliRunner()) {
			e.mode = "cli";
			runCli(e);
		}
		mount(e.target, (files) => {
			if (gen !== e.gen) return;
			if (e.cliTimer !== null) window.clearTimeout(e.cliTimer);
			e.cliTimer = null;
			e.mode = "collector";
			emit(e, files);
		}).then(
			(unmount) => {
				if (gen === e.gen) e.unmount = unmount;
				else unmount();
			},
			(err: unknown) => {
				if (gen !== e.gen) return;
				console.warn(`Improved Bases: collector failed for ${e.key}`, err);
				e.mounted = false;
				// A missing base or view stays put until `create`/`modify` remounts it; other failures keep refreshing via CLI.
				if (err instanceof BaseNotFoundError || err instanceof ViewNotFoundError) {
					e.gen++;
					clearTimers(e);
					e.mode = "collector";
					// A missing view is a failed scan: its result is unknown, not empty.
					emit(e, [], err instanceof ViewNotFoundError);
				} else if (e.mode !== "cli") emit(e, [], true);
			},
		);
	};

	const reset = (e: Entry) => {
		unmountEntry(e);
		emit(e, []);
	};

	if (app?.vault) {
		const { vault, metadataCache } = app;
		const on = (ref: EventRef, source: { offref(ref: EventRef): void }) => refs.push({ off: () => source.offref(ref) });
		/** All entries of a base: the whole base and each of its views. */
		const ofBase = (path: string) => [...entries.values()].filter((e) => e.target.base === path);
		const cliRefresh = () => {
			for (const e of entries.values()) if (e.mode === "cli") scheduleCli(e);
		};
		on(vault.on("modify", (f: TAbstractFile) => {
			for (const e of ofBase(f.path)) mountEntry(e);
		}), vault);
		on(vault.on("create", (f: TAbstractFile) => {
			for (const e of ofBase(f.path)) if (!e.mounted) mountEntry(e);
			cliRefresh();
		}), vault);
		on(vault.on("delete", (f: TAbstractFile) => {
			for (const e of ofBase(f.path)) reset(e);
			cliRefresh();
		}), vault);
		on(vault.on("rename", (f: TAbstractFile, oldPath: string) => {
			for (const e of ofBase(oldPath)) reset(e);
			for (const e of ofBase(f.path)) mountEntry(e);
			cliRefresh();
		}), vault);
		on(metadataCache.on("changed", cliRefresh), metadataCache);
	}

	return {
		watch(target, cb) {
			const key = targetKey(target);
			let e = entries.get(key);
			const fresh = !e;
			if (!e) {
				e = { target, key, listeners: new Set(), last: null, failed: false, gen: 0, mounted: false, unmount: null, mode: "collector", cliTimer: null };
				entries.set(key, e);
			}
			const entry = e;
			entry.listeners.add(cb);
			if (fresh) mountEntry(entry);
			else if (entry.last !== null) cb(entry.last, entry.failed);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				entry.listeners.delete(cb);
				if (entry.listeners.size > 0 || entries.get(key) !== entry) return;
				unmountEntry(entry);
				entries.delete(key);
			};
		},
		dispose() {
			for (const e of entries.values()) unmountEntry(e);
			entries.clear();
			for (const r of refs.splice(0)) r.off();
		},
	};
}
