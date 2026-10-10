import { describe, it, expect, vi, beforeEach } from "vitest";
import { BasesView, MarkdownRenderer, type Plugin, type TFile } from "obsidian";
import { BaseNotFoundError, registerCollector } from "../src/query/CollectorView";

type ViewDef = { factory: (controller: unknown) => BasesView };

function setup(files: Record<string, string>) {
	const views: Record<string, ViewDef> = {};
	const app = {
		workspace: { onLayoutReady: (cb: () => void) => cb() },
		vault: {
			getFileByPath: (path: string) => (path in files ? ({ path } as TFile) : null),
			cachedRead: (f: TFile) => Promise.resolve(files[f.path]),
		},
	};
	const plugin = { app, register: vi.fn(), registerBasesView: (id: string, def: ViewDef) => void (views[id] = def) } as unknown as Plugin;
	const render = vi.spyOn(MarkdownRenderer, "render").mockResolvedValue();
	return { mount: registerCollector(plugin), views, render };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("registerCollector", () => {
	it("rejects missing or non-mapping bases", async () => {
		const { mount } = setup({ "L.base": "- a\n" });
		await expect(mount("X.base", vi.fn())).rejects.toBeInstanceOf(BaseNotFoundError);
		await expect(mount("L.base", vi.fn())).rejects.toThrow(/YAML mapping/);
	});

	it("renders a hidden collector view that pushes query results until unmounted", async () => {
		const { mount, views, render } = setup({ "T.base": "filters: {}\nviews:\n  - type: table\n" });
		const push = vi.fn();
		const unmount = await mount("T.base", push);
		const host = document.body.querySelector(".improved-bases-collector-host");
		expect(host?.getAttribute("aria-hidden")).toBe("true");
		const md = render.mock.calls[0]?.[1] ?? "";
		expect(md).toMatch(/^```base\n/);
		expect(md).toContain("type: improved-bases-collector");
		const id = /collectorId: (\w+)/.exec(md)?.[1];
		const view = views["improved-bases-collector"]!.factory({}) as unknown as { onDataUpdated(): void; config: { get(k: string): unknown }; data: { data: { file: TFile }[] } };
		view.onDataUpdated(); // no collector id yet
		expect(push).not.toHaveBeenCalled();
		view.config = { get: () => id };
		const file = { path: "n.md" } as TFile;
		view.data = { data: [{ file }] };
		view.onDataUpdated();
		expect(push).toHaveBeenCalledWith([file]);
		unmount();
		expect(document.body.querySelector(".improved-bases-collector-host")).toBeNull();
		view.onDataUpdated();
		expect(push).toHaveBeenCalledTimes(1);
	});

	it("cleans up when rendering fails", async () => {
		const { mount, render } = setup({ "T.base": "views: []\n" });
		render.mockRejectedValueOnce(new Error("render failed"));
		await expect(mount("T.base", vi.fn())).rejects.toThrow("render failed");
		expect(document.body.querySelector(".improved-bases-collector-host")).toBeNull();
	});
});
