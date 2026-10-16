import { describe, it, expect, vi, afterEach } from "vitest";
import type { Plugin, TFile } from "obsidian";
import { createBaseQuery, firstResult } from "../src/query/BaseQuery";
import { BaseNotFoundError, ViewNotFoundError } from "../src/query/CollectorView";
import { targetKey, type QueryTarget } from "../src/query/target";

const plugin = {} as Plugin;
const file = (path: string) => ({ path }) as TFile;

function fakeMount() {
	const pushes = new Map<string, (f: TFile[]) => void>();
	const unmounts: string[] = [];
	const mount = vi.fn((target: QueryTarget, push: (f: TFile[]) => void) => {
		pushes.set(targetKey(target), push);
		return Promise.resolve(() => void unmounts.push(targetKey(target)));
	});
	return { mount, pushes, unmounts };
}

/** Plugin with a fake vault/metadataCache; `trigger` fires the registered handler. */
function pluginWithEvents() {
	const handlers = new Map<string, (...args: unknown[]) => void>();
	const src = { on: (n: string, cb: (...args: unknown[]) => void) => (handlers.set(n, cb), { n }), offref: () => {} };
	const p = { app: { vault: src, metadataCache: src } } as unknown as Plugin;
	return { plugin: p, trigger: (n: string, ...args: unknown[]) => handlers.get(n)!(...args) };
}

afterEach(() => {
	vi.useRealTimers();
});

describe("BaseQuery", () => {
	it("shares one collector per path and dedupes results", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount });
		const a = vi.fn(), b = vi.fn();
		const ua = q.watch({ base: "T.base" }, a); const ub = q.watch({ base: "T.base" }, b);
		await Promise.resolve();
		expect(m.mount).toHaveBeenCalledTimes(1);
		const f1 = file("x");
		m.pushes.get("T.base")!([f1]); m.pushes.get("T.base")!([f1]);
		expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
		ua(); expect(m.unmounts).toEqual([]);
		ub(); expect(m.unmounts).toEqual(["T.base"]);
	});

	it("replays the current result to a late watcher", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount });
		q.watch({ base: "T.base" }, vi.fn());
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		const late = vi.fn();
		q.watch({ base: "T.base" }, late);
		expect(late).toHaveBeenCalledWith([file("x")], false);
		expect(m.mount).toHaveBeenCalledTimes(1);
	});

	it("unmounts a collector that resolves after the last watcher left", async () => {
		let resolve!: (u: () => void) => void;
		const unmount = vi.fn();
		const mount = vi.fn(() => new Promise<() => void>((r) => (resolve = r)));
		const q = createBaseQuery(plugin, { mount });
		const off = q.watch({ base: "T.base" }, vi.fn());
		off();
		resolve(unmount);
		await Promise.resolve(); await Promise.resolve();
		expect(unmount).toHaveBeenCalledTimes(1);
	});

	it("emits [] marked as failed when mounting fails", async () => {
		const q = createBaseQuery(plugin, { mount: () => Promise.reject(new Error("x")), cli: null });
		const cb = vi.fn();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		q.watch({ base: "T.base" }, cb);
		await Promise.resolve(); await Promise.resolve();
		expect(cb).toHaveBeenCalledWith([], true);
	});

	it("marks a failed CLI scan and still emits a later empty result", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: () => Promise.reject(new Error("x")) });
		const cb = vi.fn();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		q.watch({ base: "T.base" }, cb);
		await Promise.resolve(); await Promise.resolve();
		expect(cb).toHaveBeenLastCalledWith([], true);
		m.pushes.get("T.base")!([]);
		expect(cb).toHaveBeenLastCalledWith([], false);
		expect(cb).toHaveBeenCalledTimes(2);
	});

	it("starts the first scan via CLI immediately", async () => {
		const m = fakeMount();
		const cli = vi.fn(() => Promise.resolve([file("cli")]));
		const q = createBaseQuery(plugin, { mount: m.mount, cli });
		const cb = vi.fn();
		q.watch({ base: "T.base" }, cb);
		expect(cli).toHaveBeenCalledWith({ base: "T.base" });
		await Promise.resolve(); await Promise.resolve();
		expect(cb).toHaveBeenCalledWith([{ path: "cli" }], false);
		q.dispose();
		expect(m.unmounts).toEqual(["T.base"]);
	});

	it("collector push wins over a slower CLI result and stops CLI mode", async () => {
		vi.useFakeTimers();
		let resolveCli!: (f: TFile[]) => void;
		const cli = vi.fn(() => new Promise<TFile[]>((r) => (resolveCli = r)));
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli });
		const cb = vi.fn();
		q.watch({ base: "T.base" }, cb);
		await vi.advanceTimersByTimeAsync(0);
		m.pushes.get("T.base")!([file("collector")]);
		resolveCli([file("cli")]);
		await vi.advanceTimersByTimeAsync(0);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith([{ path: "collector" }], false);
		expect(cli).toHaveBeenCalledTimes(1);
	});

	it("does not use the CLI when none is available", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: null });
		const cb = vi.fn();
		q.watch({ base: "T.base" }, cb);
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		expect(cb).toHaveBeenCalledWith([{ path: "x" }], false);
	});

	it("missing base: empty, no CLI mode, drops the in-flight CLI result", async () => {
		vi.useFakeTimers();
		const handlers = new Map<string, () => void>();
		const src = { on: (n: string, cb: () => void) => (handlers.set(n, cb), { n }), offref: () => {} };
		const p = { app: { vault: src, metadataCache: src } } as unknown as Plugin;
		let resolveCli!: (f: TFile[]) => void;
		const cli = vi.fn(() => new Promise<TFile[]>((r) => (resolveCli = r)));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const q = createBaseQuery(p, { mount: () => Promise.reject(new BaseNotFoundError("Missing.base")), cli });
		const cb = vi.fn();
		q.watch({ base: "Missing.base" }, cb);
		await vi.advanceTimersByTimeAsync(0);
		expect(cb).toHaveBeenCalledWith([], false);
		resolveCli([file("ghost")]);
		handlers.get("changed")!();
		await vi.advanceTimersByTimeAsync(10000);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cli).toHaveBeenCalledTimes(1);
	});

	it("keeps notifying other listeners when one throws", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount });
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const bad = vi.fn(() => {
			throw new Error("boom");
		});
		const good = vi.fn();
		q.watch({ base: "T.base" }, bad);
		q.watch({ base: "T.base" }, good);
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		expect(good).toHaveBeenCalledWith([file("x")], false);
		expect(err).toHaveBeenCalled();
		err.mockRestore();
	});

	it("keeps refreshing via CLI after a mount failure", async () => {
		vi.useFakeTimers();
		const handlers = new Map<string, () => void>();
		const src = {
			on: (name: string, cb: () => void) => {
				handlers.set(name, cb);
				return { name };
			},
			offref: () => {},
		};
		const p = { app: { vault: src, metadataCache: src } } as unknown as Plugin;
		const cli = vi.fn(() => Promise.resolve([file("cli")]));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const q = createBaseQuery(p, { mount: () => Promise.reject(new Error("x")), cli });
		q.watch({ base: "T.base" }, vi.fn());
		await vi.advanceTimersByTimeAsync(0);
		expect(cli).toHaveBeenCalledTimes(1);
		handlers.get("changed")!();
		await vi.advanceTimersByTimeAsync(300);
		expect(cli).toHaveBeenCalledTimes(2);
	});
	it("mounts base and base+view separately and remounts both on modify", async () => {
		const m = fakeMount();
		const ev = pluginWithEvents();
		const q = createBaseQuery(ev.plugin, { mount: m.mount, cli: null });
		const all = vi.fn(), fks = vi.fn();
		q.watch({ base: "M.base" }, all);
		q.watch({ base: "M.base", view: "FKs" }, fks);
		await Promise.resolve();
		expect(m.mount).toHaveBeenCalledTimes(2);
		m.pushes.get("M.base#FKs")!([file("a")]);
		expect(fks).toHaveBeenCalledWith([file("a")], false);
		expect(all).not.toHaveBeenCalled();
		ev.trigger("modify", { path: "M.base" });
		await Promise.resolve();
		expect(m.mount).toHaveBeenCalledTimes(4);
		expect(m.unmounts.sort()).toEqual(["M.base", "M.base#FKs"]);
	});

	it("resets every target of a deleted base", async () => {
		const m = fakeMount();
		const ev = pluginWithEvents();
		const q = createBaseQuery(ev.plugin, { mount: m.mount, cli: null });
		const all = vi.fn(), fks = vi.fn();
		q.watch({ base: "M.base" }, all);
		q.watch({ base: "M.base", view: "FKs" }, fks);
		await Promise.resolve();
		m.pushes.get("M.base")!([file("a")]);
		m.pushes.get("M.base#FKs")!([file("a")]);
		ev.trigger("delete", { path: "M.base" });
		expect(all).toHaveBeenLastCalledWith([], false);
		expect(fks).toHaveBeenLastCalledWith([], false);
	});

	it("reports a missing view as failed and recovers on modify", async () => {
		vi.useFakeTimers();
		const ev = pluginWithEvents();
		let push!: (f: TFile[]) => void;
		const mount = vi
			.fn()
			.mockImplementationOnce(() => Promise.reject(new ViewNotFoundError("M.base", "FKs")))
			.mockImplementation((_t: QueryTarget, p: (f: TFile[]) => void) => ((push = p), Promise.resolve(() => {})));
		let resolveCli!: (f: TFile[]) => void;
		const cli = vi.fn(() => new Promise<TFile[]>((r) => (resolveCli = r)));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const q = createBaseQuery(ev.plugin, { mount, cli });
		const cb = vi.fn();
		q.watch({ base: "M.base", view: "FKs" }, cb);
		await vi.advanceTimersByTimeAsync(0);
		expect(cb).toHaveBeenCalledWith([], true);
		// The in-flight CLI result of the failed mount is dropped, and no CLI refresh follows.
		resolveCli([file("ghost")]);
		ev.trigger("changed");
		await vi.advanceTimersByTimeAsync(1000);
		expect(cb).toHaveBeenCalledTimes(1);
		ev.trigger("modify", { path: "M.base" });
		await vi.advanceTimersByTimeAsync(0);
		expect(mount).toHaveBeenCalledTimes(2);
		push([file("x")]);
		expect(cb).toHaveBeenLastCalledWith([file("x")], false);
	});

	it("passes the view to the CLI runner", () => {
		const m = fakeMount();
		const cli = vi.fn(() => Promise.resolve([]));
		const q = createBaseQuery(plugin, { mount: m.mount, cli });
		q.watch({ base: "M.base", view: "FKs" }, vi.fn());
		expect(cli).toHaveBeenCalledWith({ base: "M.base", view: "FKs" });
		expect(m.mount).toHaveBeenCalledWith({ base: "M.base", view: "FKs" }, expect.any(Function));
	});
});

describe("firstResult", () => {
	it("resolves with the first result and ends the watch", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: null });
		const once = firstResult(q, { base: "T.base" });
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		expect(await once).toEqual([file("x")]);
		expect(m.unmounts).toEqual(["T.base"]);
	});

	it("takes a result that is already there", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: null });
		q.watch({ base: "T.base" }, vi.fn());
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		expect(await firstResult(q, { base: "T.base" })).toEqual([file("x")]);
	});

	it("gives null when the query fails", async () => {
		const q = createBaseQuery(plugin, { mount: () => Promise.reject(new Error("x")), cli: null });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await firstResult(q, { base: "T.base" })).toBeNull();
	});
});
