import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { SelectWidget } from "../src/widgets/SelectWidget";
import { openOptionPicker, type OptionPickerHost } from "../src/widgets/OptionPicker";
import { addOptionMutation, nextOptionColor } from "../src/widgets/values";
import type { SelectField } from "../src/schema/types";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

vi.mock("../src/widgets/OptionPicker", () => ({ openOptionPicker: vi.fn(() => ({ close: vi.fn() })) }));

function setup(value: unknown, opts: { multiple?: boolean; resolved?: boolean; writeFails?: boolean; source?: { basePath: string; name: string } } = {}) {
	const update = vi.fn((_path: string, _mutate: unknown) => (opts.writeFails ? Promise.reject(new Error("locked")) : Promise.resolve()));
	const env = {
		app: {} as App,
		writer: { update },
		membership: { resolveWithBase: () => (opts.resolved === false ? null : { basePath: "M.base", name: "Status" }) },
		overlays: new OverlayRegistry(),
	} as unknown as WidgetEnv;
	const onChange = vi.fn();
	const ctx = { app: env.app, key: "status", sourcePath: "n.md", onChange, blur: vi.fn() } as PropertyRenderContext;
	const field: SelectField = { type: "select", multiple: opts.multiple ?? true, options: [{ value: "A", color: "red" }] };
	const el = document.body.createDiv();
	const handle = SelectWidget(el, value, ctx, field, env, opts.source);
	const root = el.querySelector<HTMLElement>(".improved-bases-select") as HTMLElement;
	const pills = () => Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.querySelector(".improved-bases-pill-body")?.textContent);
	const open = (): OptionPickerHost => {
		root.click();
		const call = vi.mocked(openOptionPicker).mock.calls.at(-1);
		if (!call) throw new Error("picker not opened");
		return call[1];
	};
	return { el, root, handle, onChange, update, pills, open, env };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(openOptionPicker).mockClear();
});

describe("SelectWidget", () => {
	it("is a focusable dialog button without add and remove buttons", () => {
		const { el, root, handle } = setup(["A"]);
		expect(root.getAttribute("tabindex")).toBe("0");
		expect(root.getAttribute("role")).toBe("button");
		expect(root.getAttribute("aria-haspopup")).toBe("dialog");
		expect(el.querySelector(".improved-bases-add")).toBeNull();
		expect(el.querySelector(".improved-bases-chip-remove")).toBeNull();
		handle.focus?.();
		expect(document.activeElement).toBe(root);
	});
	it("opens the picker on click, Enter and Space", () => {
		const { root, env } = setup(["A"]);
		root.click();
		expect(openOptionPicker).toHaveBeenLastCalledWith(root, expect.any(Object), env.overlays);
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		root.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		expect(openOptionPicker).toHaveBeenCalledTimes(3);
		root.querySelector(".improved-bases-pill")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(openOptionPicker).toHaveBeenCalledTimes(3);
	});
	it("closes the previous picker before opening another", () => {
		const close = vi.fn();
		vi.mocked(openOptionPicker).mockReturnValueOnce({ close });
		const { root } = setup(["A"]);
		root.click();
		expect(close).not.toHaveBeenCalled();
		root.click();
		expect(close).toHaveBeenCalledTimes(1);
	});
	it("hands copies of options and values to the picker", () => {
		const { open } = setup(["A", "Z"], { multiple: false });
		const host = open();
		expect(host.options).toEqual([{ value: "A", color: "red" }]);
		expect(host.values).toEqual(["A", "Z"]);
		expect(host.multiple).toBe(false);
	});
	it("flags unknown values grey", () => {
		const { el, pills } = setup(["A", "Z"]);
		expect(pills()).toEqual(["A", "Z"]);
		const z = el.querySelectorAll(".improved-bases-pill")[1];
		expect(z?.getAttribute("title")).toBe("Not in options");
		expect(z?.getAttribute("data-color")).toBe("grey");
	});
	it("commits as list for multiple and as string for single, redrawing pills", () => {
		const multi = setup(["A"]);
		multi.open().commit(["B"]);
		expect(multi.onChange).toHaveBeenCalledWith(["B"]);
		expect(multi.pills()).toEqual(["B"]);
		const single = setup("A", { multiple: false });
		single.open().commit(["B"]);
		expect(single.onChange).toHaveBeenCalledWith("B");
	});
	it("creates an option in the schema and resolves it", async () => {
		const { open, update } = setup(["A"]);
		const option = await open().create("N");
		expect(update).toHaveBeenCalledWith("M.base", expect.any(Function));
		const mutate = update.mock.calls[0]?.[1];
		expect(String(mutate)).toBe(String(addOptionMutation("Status", "N", nextOptionColor(1))));
		expect(option).toEqual({ value: "N", color: nextOptionColor(1) });
	});
	it("writes options into the base the patch resolved", async () => {
		const { open, update } = setup(["A"], { source: { basePath: "Viewed.base", name: "Status" } });
		await open().create("B");
		expect(update).toHaveBeenCalledWith("Viewed.base", expect.any(Function));
	});
	it("resolves null when the schema write fails or the field is unresolved", async () => {
		const failing = setup(["A"], { writeFails: true });
		expect(await failing.open().create("N")).toBeNull();
		const unresolved = setup(["A"], { resolved: false });
		expect(await unresolved.open().create("N")).toBeNull();
		expect(unresolved.update).not.toHaveBeenCalled();
	});
	it("recolors through the schema and updates the pill", async () => {
		const { el, open, update } = setup(["A", "Z"]);
		const pill = (i: number) => el.querySelectorAll(".improved-bases-pill")[i];
		const host = open();
		expect(await host.recolor("A", "blue")).toBe(true);
		expect(update).toHaveBeenCalledTimes(1);
		expect(pill(0)?.getAttribute("data-color")).toBe("blue");
		expect(await host.recolor("Z", "green")).toBe(true);
		expect(pill(1)?.getAttribute("data-color")).toBe("green");
	});
	it("does not recolor when the write fails", async () => {
		const { el, open } = setup(["A"], { writeFails: true });
		expect(await open().recolor("A", "blue")).toBe(false);
		expect(el.querySelector(".improved-bases-pill")?.getAttribute("data-color")).toBe("red");
	});
	it("leaves rename and remove for later", async () => {
		const host = setup(["A"]).open();
		expect(await host.rename("A", "B")).toBe(false);
		expect(await host.remove("A")).toBe(false);
	});
});
