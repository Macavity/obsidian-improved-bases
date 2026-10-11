import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { SelectWidget } from "../src/widgets/SelectWidget";
import { openColorMenu, openOptionMenu } from "../src/widgets/pickers";
import type { Color, SelectField } from "../src/schema/types";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

vi.mock("../src/widgets/pickers", () => ({ openOptionMenu: vi.fn(), openColorMenu: vi.fn() }));

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(value: unknown, opts: { multiple?: boolean; resolved?: boolean; writeFails?: boolean; source?: { basePath: string; name: string } } = {}) {
	const update = vi.fn(() => (opts.writeFails ? Promise.reject(new Error("locked")) : Promise.resolve()));
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
	SelectWidget(el, value, ctx, field, env, opts.source);
	el.querySelector<HTMLElement>(".improved-bases-add")?.click();
	const call = vi.mocked(openOptionMenu).mock.calls.at(-1);
	if (!call) throw new Error("option menu not opened");
	const pills = () => Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.querySelector(".improved-bases-pill-body")?.textContent);
	return { el, onChange, update, pills, choose: call[3], create: call[4] };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(openOptionMenu).mockClear();
	vi.mocked(openColorMenu).mockClear();
});

describe("SelectWidget", () => {
	it("renders pills, flags unknown values and removes on click", () => {
		const { el, onChange, pills } = setup(["A", "Z"]);
		expect(pills()).toEqual(["A", "Z"]);
		const z = el.querySelectorAll(".improved-bases-pill")[1];
		expect(z?.getAttribute("title")).toBe("Not in options");
		expect(z?.getAttribute("data-color")).toBe("grey");
		z?.querySelector<HTMLElement>(".improved-bases-chip-remove")?.click();
		expect(onChange).toHaveBeenCalledWith(["A"]);
	});
	it("toggles values on choose", () => {
		const { onChange, choose } = setup(["A"]);
		choose("A");
		expect(onChange).toHaveBeenLastCalledWith([]);
		choose("B");
		expect(onChange).toHaveBeenLastCalledWith(["B"]);
		const single = setup("A", { multiple: false });
		single.choose("B");
		expect(single.onChange).toHaveBeenLastCalledWith("B");
	});
	it("creates an option in the schema, then selects it", async () => {
		const { onChange, update, create, pills } = setup(["A"]);
		create("New");
		await tick();
		expect(update).toHaveBeenCalledWith("M.base", expect.any(Function));
		expect(onChange).toHaveBeenCalledWith(["A", "New"]);
		expect(pills()).toEqual(["A", "New"]);
		create("New"); // already present: no duplicate option or value
		await tick();
		expect(onChange).toHaveBeenCalledTimes(1);
		const single = setup("A", { multiple: false });
		single.create("New");
		await tick();
		expect(single.onChange).toHaveBeenCalledWith("New");
	});
	it("writes options into the base the patch resolved, not the first by path", async () => {
		const { update, create } = setup(["A"], { source: { basePath: "Viewed.base", name: "Status" } });
		create("B");
		await tick();
		expect(update).toHaveBeenCalledWith("Viewed.base", expect.any(Function));
	});
	it("does not select when the schema write fails or the field is unresolved", async () => {
		const failing = setup(["A"], { writeFails: true });
		failing.create("New");
		await tick();
		expect(failing.onChange).not.toHaveBeenCalled();
		const unresolved = setup(["A"], { resolved: false });
		unresolved.create("New");
		await tick();
		expect(unresolved.update).not.toHaveBeenCalled();
	});
	it("recolors through the color menu", async () => {
		const { el, update } = setup(["A", "Z"]);
		const pill = (i: number) => el.querySelectorAll(".improved-bases-pill")[i];
		pill(0)?.dispatchEvent(new MouseEvent("contextmenu"));
		const onPick = (i: number) => vi.mocked(openColorMenu).mock.calls[i]?.[1] as (c: Color) => void;
		onPick(0)("blue");
		await tick();
		expect(update).toHaveBeenCalledTimes(1);
		expect(pill(0)?.getAttribute("data-color")).toBe("blue");
		pill(1)?.dispatchEvent(new MouseEvent("contextmenu"));
		onPick(1)("green");
		await tick();
		expect(pill(1)?.getAttribute("data-color")).toBe("green");
	});
});
