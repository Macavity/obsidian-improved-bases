import { afterEach, describe, expect, it, vi } from "vitest";
import { openOptionPicker, placePopover, type OptionPickerHost } from "../src/widgets/OptionPicker";
import { OverlayRegistry } from "../src/widgets/types";
import type { SelectOption } from "../src/schema/types";

const OPTIONS: SelectOption[] = [
	{ value: "Alpha", color: "red" },
	{ value: "Beta", color: "blue" },
	{ value: "Gamma", color: "green" },
];

const setup = (p: Partial<OptionPickerHost> = {}) => {
	const anchor = document.body.createDiv();
	const commit = vi.fn();
	const create = vi.fn((value: string) => Promise.resolve<SelectOption | null>({ value, color: "orange" }));
	const host: OptionPickerHost = {
		options: OPTIONS.map((o) => ({ ...o })),
		values: [],
		multiple: false,
		commit,
		create,
		recolor: vi.fn(() => Promise.resolve(true)),
		rename: vi.fn(() => Promise.resolve(true)),
		remove: vi.fn(() => Promise.resolve(true)),
		...p,
	};
	const overlays = new OverlayRegistry();
	const picker = openOptionPicker(anchor, host, overlays);
	const popover = () => document.body.querySelector<HTMLElement>(".improved-bases-option-picker");
	const input = () => popover()?.querySelector("input") as HTMLInputElement;
	const rows = () => Array.from(popover()?.querySelectorAll<HTMLElement>(".improved-bases-picker-row") ?? []);
	const labels = () => rows().map((r) => r.textContent);
	const createRow = () => popover()?.querySelector<HTMLElement>(".improved-bases-picker-create") ?? null;
	const headerPills = () => Array.from(popover()?.querySelectorAll<HTMLElement>(".improved-bases-picker-header .improved-bases-pill") ?? []);
	const type = (q: string) => {
		input().value = q;
		input().dispatchEvent(new Event("input"));
	};
	const key = (k: string) => {
		const e = new KeyboardEvent("keydown", { key: k, cancelable: true });
		input().dispatchEvent(e);
		return e;
	};
	return { anchor, host, commit, create, overlays, picker, popover, input, rows, labels, createRow, headerPills, type, key };
};

afterEach(() => {
	document.body.empty();
	vi.restoreAllMocks();
});

describe("placePopover", () => {
	it("places below, or above when below is too small and above is larger", () => {
		const vp = { width: 1000, height: 800 };
		expect(placePopover(new DOMRect(10, 100, 120, 30), vp, { width: 260, height: 300 })).toMatchObject({ top: 130, left: 10, width: 260, above: false });
		expect(placePopover(new DOMRect(10, 700, 300, 30), vp, { width: 260, height: 300 })).toMatchObject({ above: true, width: 300 });
	});
	it("stays below when it fits, and keeps the popover inside the viewport", () => {
		const vp = { width: 400, height: 800 };
		expect(placePopover(new DOMRect(300, 400, 50, 30), vp, { width: 260, height: 300 })).toMatchObject({ top: 430, left: 140, above: false });
		expect(placePopover(new DOMRect(10, 100, 50, 30), vp, { width: 260, height: 300 }).above).toBe(false);
		expect(placePopover(new DOMRect(10, 150, 50, 600), vp, { width: 260, height: 300 })).toMatchObject({ top: 0, above: true });
	});
});

describe("openOptionPicker", () => {
	it("opens at body with the focused input, the options and the active values", () => {
		const { popover, input, labels, rows, headerPills } = setup({ values: ["Beta"] });
		expect(popover()?.parentElement).toBe(document.body);
		expect(popover()?.style.getPropertyValue("--ib-picker-width")).toBe("260px");
		expect(popover()?.classList.contains("is-above")).toBe(false);
		expect(document.activeElement).toBe(input());
		expect(labels()).toEqual(["Alpha", "Beta✓", "Gamma"]);
		expect(rows()[1]?.classList.contains("is-active")).toBe(true);
		expect(rows()[0]?.classList.contains("is-selected")).toBe(true);
		expect(headerPills().map((p) => [p.dataset.color, p.querySelector(".improved-bases-pill-body")?.textContent])).toEqual([["blue", "Beta"]]);
	});

	it("filters case-insensitively and offers create only without an exact match", () => {
		const { labels, createRow, type } = setup();
		type("a");
		expect(labels()).toEqual(["Alpha", "Beta", "Gamma"]);
		type("ALP");
		expect(labels()).toEqual(["Alpha"]);
		expect(createRow()?.textContent).toBe('Create "ALP"');
		type("alpha");
		expect(createRow()).toBeNull();
		type("  ");
		expect(createRow()).toBeNull();
	});

	it("Enter creates the option and commits it (single)", async () => {
		const { host, key, type, popover, commit, create } = setup();
		type("Neu");
		key("Enter");
		await vi.waitFor(() => expect(commit).toHaveBeenCalledWith(["Neu"]));
		expect(create).toHaveBeenCalledWith("Neu");
		expect(host.options.map((o) => o.value)).toContain("Neu");
		expect(popover()).toBeNull();
	});

	it("creating in multiple adds the value and stays open", async () => {
		const { type, createRow, input, popover, labels, commit } = setup({ multiple: true, values: ["Alpha"] });
		type("Neu");
		createRow()?.click();
		await vi.waitFor(() => expect(commit).toHaveBeenCalledWith(["Alpha", "Neu"]));
		expect(input().value).toBe("");
		expect(popover()).not.toBeNull();
		expect(labels()).toContain("Neu✓");
	});

	it("does nothing when the host refuses to create", async () => {
		const create = vi.fn(() => Promise.resolve(null));
		const { type, key, popover, commit } = setup({ create });
		type("Neu");
		key("Enter");
		await vi.waitFor(() => expect(create).toHaveBeenCalled());
		await Promise.resolve();
		expect(commit).not.toHaveBeenCalled();
		expect(popover()).not.toBeNull();
	});

	it("closes when creating fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { type, key, popover } = setup({ create: () => Promise.reject(new Error("boom")) });
		type("Neu");
		key("Enter");
		await vi.waitFor(() => expect(popover()).toBeNull());
		expect(error).toHaveBeenCalledWith("Improved Bases: option picker failed", expect.any(Error));
	});

	it("single replaces the value and closes; clicking the active value clears", () => {
		const first = setup({ values: ["Alpha"] });
		first.rows()[1]?.click();
		expect(first.commit).toHaveBeenCalledWith(["Beta"]);
		expect(first.popover()).toBeNull();

		const second = setup({ values: ["Alpha"] });
		second.rows()[0]?.click();
		expect(second.commit).toHaveBeenCalledWith([]);
		expect(second.popover()).toBeNull();
	});

	it("multiple toggles and stays open", () => {
		const { rows, popover, headerPills, commit } = setup({ multiple: true, values: ["Alpha"] });
		rows()[2]?.click();
		expect(commit).toHaveBeenLastCalledWith(["Alpha", "Gamma"]);
		rows()[0]?.click();
		expect(commit).toHaveBeenLastCalledWith(["Gamma"]);
		expect(popover()).not.toBeNull();
		expect(headerPills().map((p) => p.textContent?.replace("×", ""))).toEqual(["Gamma"]);
	});

	it("moves the highlight with the arrow keys and picks it with Enter", () => {
		const { key, rows, type, createRow, commit } = setup({ multiple: true });
		expect(key("ArrowDown").defaultPrevented).toBe(true);
		key("ArrowDown");
		key("ArrowDown");
		expect(rows()[2]?.classList.contains("is-selected")).toBe(true);
		key("ArrowUp");
		expect(rows()[1]?.classList.contains("is-selected")).toBe(true);
		key("Enter");
		expect(commit).toHaveBeenLastCalledWith(["Beta"]);
		type("e");
		key("ArrowDown");
		key("ArrowDown");
		expect(createRow()?.classList.contains("is-selected")).toBe(true);
		key("ArrowUp");
		key("ArrowUp");
		key("ArrowUp");
		expect(rows()[0]?.classList.contains("is-selected")).toBe(true);
		expect(key("a").defaultPrevented).toBe(false);
	});

	it("shows a hint for an empty option list", () => {
		const { popover, key, create } = setup({ options: [] });
		expect(popover()?.querySelector(".improved-bases-picker-hint")?.textContent).toBe("Type to create an option");
		key("Enter");
		expect(create).not.toHaveBeenCalled();
	});

	it("Backspace on an empty query removes the last value", () => {
		const { key, type, headerPills, commit } = setup({ multiple: true, values: ["Alpha", "Beta"] });
		expect(key("Backspace").defaultPrevented).toBe(true);
		expect(commit).toHaveBeenLastCalledWith(["Alpha"]);
		expect(headerPills()).toHaveLength(1);
		type("x");
		expect(key("Backspace").defaultPrevented).toBe(false);
		expect(commit).toHaveBeenCalledTimes(1);
	});

	it("Backspace with no values does nothing", () => {
		const { key, commit } = setup();
		expect(key("Backspace").defaultPrevented).toBe(false);
		expect(commit).not.toHaveBeenCalled();
	});

	it("Escape closes", () => {
		const { key, popover } = setup();
		expect(key("Escape").defaultPrevented).toBe(true);
		expect(popover()).toBeNull();
	});

	it("closes on an outside mousedown, not on one inside", () => {
		const { popover, input } = setup();
		input().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(popover()).not.toBeNull();
		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		expect(popover()).toBeNull();
	});

	it("closes through the overlay registry; close is idempotent", () => {
		const { overlays, popover, picker } = setup();
		overlays.closeAll();
		expect(popover()).toBeNull();
		picker.close();
		expect(popover()).toBeNull();
	});

	it("the × of a header pill removes the value", () => {
		const { headerPills, popover, commit } = setup({ multiple: true, values: ["Alpha", "Beta"] });
		headerPills()[0]?.querySelector<HTMLButtonElement>("button")?.click();
		expect(commit).toHaveBeenCalledWith(["Beta"]);
		expect(headerPills()).toHaveLength(1);
		expect(popover()).not.toBeNull();
	});

	it("shows a value without option as a grey pill", () => {
		const { headerPills } = setup({ values: ["Ghost"] });
		const [pill] = headerPills();
		expect(pill?.dataset.color).toBe("grey");
		expect(pill?.title).toBe("Not in options");
	});

	it("closes and logs when rendering fails", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const options = [{ value: "Alpha", color: "red" }] as SelectOption[];
		const { popover, type } = setup({ options });
		Object.defineProperty(options[0], "value", { get: () => { throw new Error("boom"); } });
		type("x");
		expect(popover()).toBeNull();
		expect(error).toHaveBeenCalledWith("Improved Bases: option picker failed", expect.any(Error));
	});
});
