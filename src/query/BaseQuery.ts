import { App, EventRef, Plugin, TAbstractFile, TFile } from "obsidian";
import { cliQuery, cliQueryAvailable } from "../internals/cliQuery";
import { COLLECTOR_VIEW, registerCollector } from "./CollectorView";

export { COLLECTOR_VIEW };

export interface BaseQuery {
	/** cb fires with the current result after the first scan and on every change (deduplicated). */
	watch(basePath: string, cb: (files: TFile[]) => void): () => void;
	dispose(): void;
}

export type MountCollector = (basePath: string, push: (files: TFile[]) => void) => Promise<() => void>;
type CliRunner = (basePath: string) => Promise<TFile[]>;

export interface BaseQueryDeps {
	mount?: MountCollector;
	/** CLI fallback; undefined = internal base:query handler when available, null = no fallback. */
	cli?: CliRunner | null;
	/** Delay before falling back to the CLI when the collector delivered nothing. */
	fallbackMs?: number;
}

const FALLBACK_MS = 5000;
const CLI_DEBOUNCE_MS = 200;

type Listener = (files: TFile[]) => void;

interface Entry {
	path: string;
	listeners: Set<Listener>;
	last: TFile[] | null;
	/** Bumped on every (re)mount and unmount; async results from older generations are dropped. */
	gen: number;
	mounted: boolean;
	unmount: (() => void) | null;
	fallbackTimer: number | null;
	mode: "collector" | "cli";
	cliTimer: number | null;
}

function samePaths(a: TFile[] | null, b: TFile[]): boolean {
	return a !== null && a.length === b.length && a.every((f, i) => f.path === b[i]?.path);
}

export function createBaseQuery(plugin: Plugin, deps: BaseQueryDeps = {}): BaseQuery {
	const app = (plugin as { app?: App }).app;
	const mount = deps.mount ?? registerCollector(plugin);
	const fallbackMs = deps.fallbackMs ?? FALLBACK_MS;
	const entries = new Map<string, Entry>();
	const refs: Array<{ off: () => void }> = [];

	const cliRunner = (): CliRunner | null => {
		if (deps.cli !== undefined) return deps.cli;
		return app && cliQueryAvailable(app) ? (p) => cliQuery(app, p) : null;
	};

	const emit = (e: Entry, files: TFile[]) => {
		if (samePaths(e.last, files)) return;
		e.last = files;
		for (const cb of [...e.listeners]) cb(files);
	};

	const clearTimers = (e: Entry) => {
		if (e.fallbackTimer !== null) window.clearTimeout(e.fallbackTimer);
		if (e.cliTimer !== null) window.clearTimeout(e.cliTimer);
		e.fallbackTimer = e.cliTimer = null;
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
				emit(e, []);
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
		e.fallbackTimer = window.setTimeout(() => {
			e.fallbackTimer = null;
			if (gen !== e.gen || !cliRunner()) return;
			e.mode = "cli";
			runCli(e);
		}, fallbackMs);
		mount(e.path, (files) => {
			if (gen !== e.gen) return;
			if (e.fallbackTimer !== null) window.clearTimeout(e.fallbackTimer);
			e.fallbackTimer = null;
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
				emit(e, []);
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
			for (const e of entries.values()) if (e.mode === "cli" && e.mounted) scheduleCli(e);
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
				e = { path: basePath, listeners: new Set(), last: null, gen: 0, mounted: false, unmount: null, fallbackTimer: null, mode: "collector", cliTimer: null };
				entries.set(basePath, e);
			}
			const entry = e;
			entry.listeners.add(cb);
			if (fresh) mountEntry(entry);
			else if (entry.last !== null) cb(entry.last);
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
