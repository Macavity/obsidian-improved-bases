import { describe, it, expect, vi, afterEach } from "vitest";
import type { Plugin, TFile } from "obsidian";
import { createBaseQuery, firstResult } from "../src/query/BaseQuery";
import { BaseNotFoundError } from "../src/query/CollectorView";

const plugin = {} as Plugin;
const file = (path: string) => ({ path }) as TFile;

function fakeMount() {
	const pushes = new Map<string, (f: TFile[]) => void>();
	const unmounts: string[] = [];
	const mount = vi.fn((path: string, push: (f: TFile[]) => void) => {
		pushes.set(path, push);
		return Promise.resolve(() => void unmounts.push(path));
	});
	return { mount, pushes, unmounts };
}

afterEach(() => {
	vi.useRealTimers();
});

describe("BaseQuery", () => {
	it("shares one collector per path and dedupes results", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount });
		const a = vi.fn(), b = vi.fn();
		const ua = q.watch("T.base", a); const ub = q.watch("T.base", b);
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
		q.watch("T.base", vi.fn());
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		const late = vi.fn();
		q.watch("T.base", late);
		expect(late).toHaveBeenCalledWith([file("x")], false);
		expect(m.mount).toHaveBeenCalledTimes(1);
	});

	it("unmounts a collector that resolves after the last watcher left", async () => {
		let resolve!: (u: () => void) => void;
		const unmount = vi.fn();
		const mount = vi.fn(() => new Promise<() => void>((r) => (resolve = r)));
		const q = createBaseQuery(plugin, { mount });
		const off = q.watch("T.base", vi.fn());
		off();
		resolve(unmount);
		await Promise.resolve(); await Promise.resolve();
		expect(unmount).toHaveBeenCalledTimes(1);
	});

	it("emits [] marked as failed when mounting fails", async () => {
		const q = createBaseQuery(plugin, { mount: () => Promise.reject(new Error("x")), cli: null });
		const cb = vi.fn();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		q.watch("T.base", cb);
		await Promise.resolve(); await Promise.resolve();
		expect(cb).toHaveBeenCalledWith([], true);
	});

	it("marks a failed CLI scan and still emits a later empty result", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: () => Promise.reject(new Error("x")) });
		const cb = vi.fn();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		q.watch("T.base", cb);
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
		q.watch("T.base", cb);
		expect(cli).toHaveBeenCalledWith("T.base");
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
		q.watch("T.base", cb);
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
		q.watch("T.base", cb);
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
		q.watch("Missing.base", cb);
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
		q.watch("T.base", bad);
		q.watch("T.base", good);
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
		q.watch("T.base", vi.fn());
		await vi.advanceTimersByTimeAsync(0);
		expect(cli).toHaveBeenCalledTimes(1);
		handlers.get("changed")!();
		await vi.advanceTimersByTimeAsync(300);
		expect(cli).toHaveBeenCalledTimes(2);
	});
});

describe("firstResult", () => {
	it("resolves with the first result and ends the watch", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: null });
		const once = firstResult(q, "T.base");
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		expect(await once).toEqual([file("x")]);
		expect(m.unmounts).toEqual(["T.base"]);
	});

	it("takes a result that is already there", async () => {
		const m = fakeMount();
		const q = createBaseQuery(plugin, { mount: m.mount, cli: null });
		q.watch("T.base", vi.fn());
		await Promise.resolve();
		m.pushes.get("T.base")!([file("x")]);
		expect(await firstResult(q, "T.base")).toEqual([file("x")]);
	});

	it("gives null when the query fails", async () => {
		const q = createBaseQuery(plugin, { mount: () => Promise.reject(new Error("x")), cli: null });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await firstResult(q, "T.base")).toBeNull();
	});
});
