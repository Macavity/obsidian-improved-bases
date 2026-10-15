import { App, EventRef, Plugin, TAbstractFile, TFile } from "obsidian";
import { cliQuery, cliQueryAvailable } from "../internals/cliQuery";
import { BaseNotFoundError, registerCollector } from "./CollectorView";

export interface BaseQuery {
	/** cb fires with the current result after the first scan and on every change (deduplicated); `failed` marks the `[]` of a failed scan. */
	watch(basePath: string, cb: Listener): () => void;
	dispose(): void;
}

/** The first result of a base, or null when its scan failed; the watch ends either way. */
export function firstResult(query: BaseQuery, basePath: string): Promise<TFile[] | null> {
	return new Promise((resolve) => {
		let done = false;
		const stop = query.watch(basePath, (files, failed) => {
			if (done) return;
			done = true;
			// A cached result arrives inside `watch`, before `stop` is assigned.
			queueMicrotask(() => stop());
			resolve(failed ? null : files);
		});
	});
}

export type MountCollector = (basePath: string, push: (files: TFile[]) => void) => Promise<() => void>;
type CliRunner = (basePath: string) => Promise<TFile[]>;

export interface BaseQueryDeps {
	mount?: MountCollector;
	/** CLI fallback; undefined = internal base:query handler when available, null = no fallback. */
	cli?: CliRunner | null;
}

const CLI_DEBOUNCE_MS = 200;

type Listener = (files: TFile[], failed: boolean) => void;

interface Entry {
	path: string;
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
				console.error(`Improved Bases: listener for ${e.path} failed`, err);
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
		cli(e.path).then(
			(files) => gen === e.gen && e.mode === "cli" && emit(e, files),
			(err: unknown) => {
				if (gen !== e.gen || e.mode !== "cli") return;
				console.warn(`Improved Bases: CLI query failed for ${e.path}`, err);
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
		mount(e.path, (files) => {
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
				console.warn(`Improved Bases: collector failed for ${e.path}`, err);
				e.mounted = false;
				// A missing base stays empty until `create` remounts it; other failures keep refreshing via CLI.
				if (err instanceof BaseNotFoundError) {
					e.gen++;
					clearTimers(e);
					e.mode = "collector";
					emit(e, []);
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
		const cliRefresh = () => {
			for (const e of entries.values()) if (e.mode === "cli") scheduleCli(e);
		};
		on(vault.on("modify", (f: TAbstractFile) => {
			const e = entries.get(f.path);
			if (e) mountEntry(e);
		}), vault);
		on(vault.on("create", (f: TAbstractFile) => {
			const e = entries.get(f.path);
			if (e && !e.mounted) mountEntry(e);
			cliRefresh();
		}), vault);
		on(vault.on("delete", (f: TAbstractFile) => {
			const e = entries.get(f.path);
			if (e) reset(e);
			cliRefresh();
		}), vault);
		on(vault.on("rename", (f: TAbstractFile, oldPath: string) => {
			const old = entries.get(oldPath);
			if (old) reset(old);
			const e = entries.get(f.path);
			if (e) mountEntry(e);
			cliRefresh();
		}), vault);
		on(metadataCache.on("changed", cliRefresh), metadataCache);
	}

	return {
		watch(basePath, cb) {
			let e = entries.get(basePath);
			const fresh = !e;
			if (!e) {
				e = { path: basePath, listeners: new Set(), last: null, failed: false, gen: 0, mounted: false, unmount: null, mode: "collector", cliTimer: null };
				entries.set(basePath, e);
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
				if (entry.listeners.size > 0 || entries.get(basePath) !== entry) return;
				unmountEntry(entry);
				entries.delete(basePath);
			};
		},
		dispose() {
			for (const e of entries.values()) unmountEntry(e);
			entries.clear();
			for (const r of refs.splice(0)) r.off();
		},
	};
}
