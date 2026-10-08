import { describe, it, expect, vi, afterEach } from "vitest";
import type { Plugin, TFile } from "obsidian";
import { createBaseQuery } from "../src/query/BaseQuery";

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
		expect(late).toHaveBeenCalledWith([file("x")]);
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

	it("emits [] when mounting fails", async () => {
		const q = createBaseQuery(plugin, { mount: () => Promise.reject(new Error("Base not found")) });
		const cb = vi.fn();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		q.watch("Missing.base", cb);
		await Promise.resolve(); await Promise.resolve();
		expect(cb).toHaveBeenCalledWith([]);
	});

	it("falls back to the CLI query when the collector stays silent", async () => {
		vi.useFakeTimers();
		const m = fakeMount();
		const cli = vi.fn(() => Promise.resolve([file("cli")]));
		const q = createBaseQuery(plugin, { mount: m.mount, cli, fallbackMs: 5000 });
		const cb = vi.fn();
		q.watch("T.base", cb);
		await vi.advanceTimersByTimeAsync(4999);
		expect(cli).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(cli).toHaveBeenCalledWith("T.base");
		expect(cb).toHaveBeenCalledWith([{ path: "cli" }]);
		q.dispose();
		expect(m.unmounts).toEqual(["T.base"]);
	});

	it("does not fall back when the collector delivered", async () => {
		vi.useFakeTimers();
		const m = fakeMount();
		const cli = vi.fn(() => Promise.resolve([] as TFile[]));
		const q = createBaseQuery(plugin, { mount: m.mount, cli, fallbackMs: 5000 });
		q.watch("T.base", vi.fn());
		await vi.advanceTimersByTimeAsync(0);
		m.pushes.get("T.base")!([]);
		await vi.advanceTimersByTimeAsync(10000);
		expect(cli).not.toHaveBeenCalled();
	});
});
