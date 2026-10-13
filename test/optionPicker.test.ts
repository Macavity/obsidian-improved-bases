import { afterEach, describe, expect, it, vi } from "vitest";
import { openOptionPicker, type OptionPickerHost } from "../src/widgets/OptionPicker";
import { placePopover } from "../src/widgets/placePopover";
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
	const fns = {
		recolor: vi.fn((_value: string, _color: string) => Promise.resolve(true)),
		rename: vi.fn((_from: string, _to: string) => Promise.resolve(true)),
		remove: vi.fn((_value: string) => Promise.resolve(true)),
	};
	const create = vi.fn((value: string) => Promise.resolve<SelectOption | null>({ value, color: "orange" }));
	const host: OptionPickerHost = {
		options: OPTIONS.map((o) => ({ ...o })),
		values: [],
		multiple: false,
		commit,
		create,
		recolor: fns.recolor,
		rename: fns.rename,
		remove: fns.remove,
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
	return { anchor, host, fns, commit, create, overlays, picker, popover, input, rows, labels, createRow, headerPills, type, key };
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
	it("right-aligns to the anchor with align end, clamped into the viewport", () => {
		const vp = { width: 400, height: 800 };
		expect(placePopover(new DOMRect(300, 100, 20, 20), vp, { width: 220, height: 190 }, "end")).toMatchObject({ left: 100, top: 120 });
		expect(placePopover(new DOMRect(10, 100, 20, 20), vp, { width: 220, height: 190 }, "end").left).toBe(0);
	});
	it("stays below when it fits, and keeps the popover inside the viewport", () => {
		const vp = { width: 400, height: 800 };
		expect(placePopover(new DOMRect(300, 400, 50, 30), vp, { width: 260, height: 300 })).toMatchObject({ top: 430, left: 140, above: false });
		expect(placePopover(new DOMRect(10, 100, 50, 30), vp, { width: 260, height: 300 }).above).toBe(false);
		expect(placePopover(new DOMRect(10, 150, 50, 600), vp, { width: 260, height: 300 })).toMatchObject({ top: 0, above: true });
	});
});

describe("openOptionPicker", () => {
	it("moves the highlight to the hovered row, so Enter picks it", () => {
		const { rows, key, commit } = setup();
		rows()[2]?.dispatchEvent(new MouseEvent("mouseenter"));
		expect(rows().map((r) => r.classList.contains("is-selected"))).toEqual([false, false, true]);
		key("Enter");
		expect(commit).toHaveBeenCalledWith(["Gamma"]);
	});
	it("orders pill, pencil, check slot and keeps the slot on inactive rows", () => {
		const { rows } = setup({ values: ["Beta"] });
		const classes = (r: HTMLElement | undefined) => Array.from(r?.children ?? []).map((c) => c.className.split(" ")[0]);
		expect(classes(rows()[1])).toEqual(["improved-bases-pill", "improved-bases-picker-edit", "improved-bases-picker-check"]);
		expect(classes(rows()[0])).toEqual(classes(rows()[1]));
	});
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

	it("does not commit a created option when the picker closed meanwhile", async () => {
		let resolve: (o: SelectOption) => void = () => undefined;
		const create = vi.fn(() => new Promise<SelectOption | null>((r) => (resolve = r)));
		const { type, key, picker, commit } = setup({ create });
		type("Neu");
		key("Enter");
		picker.close();
		resolve({ value: "Neu", color: "orange" });
		await Promise.resolve();
		await Promise.resolve();
		expect(commit).not.toHaveBeenCalled();
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

	it("scrolls the highlighted row into view on arrow keys", () => {
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		const { key, rows } = setup();
		key("ArrowDown");
		key("ArrowDown");
		expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
		expect(scroll.mock.contexts.at(-1)).toBe(rows()[2]);
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

	describe("option editor", () => {
		const editorEl = () => document.body.querySelector<HTMLElement>(".improved-bases-option-editor");
		const pencil = (r: HTMLElement | undefined) => r?.querySelector<HTMLElement>(".improved-bases-picker-edit") as HTMLElement;
		const flush = () => new Promise((r) => setTimeout(r, 0));
		const rename = async (to: string) => {
			const input = editorEl()?.querySelector("input") as HTMLInputElement;
			input.value = to;
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
			await flush();
		};
		it("opens from the pencil with an aria-label", () => {
			const { rows } = setup();
			expect(pencil(rows()[0]).getAttribute("aria-label")).toBe("Edit option Alpha");
			expect(pencil(rows()[0]).getAttribute("data-icon")).toBe("lucide-pencil");
			pencil(rows()[0]).click();
			expect(editorEl()).not.toBeNull();
		});
		it("places the editor at the pencil, not at the row", () => {
			const { rows } = setup();
			const rect = new DOMRect(300, 50, 20, 20);
			const btn = pencil(rows()[0]);
			vi.spyOn(btn, "getBoundingClientRect").mockReturnValue(rect);
			btn.click();
			expect(editorEl()?.style.getPropertyValue("--ib-editor-top")).toBe("70px");
			expect(editorEl()?.style.getPropertyValue("--ib-editor-left")).toBe("100px");
		});
		it("renames in list and header after success, closing the editor", async () => {
			const { rows, labels, headerPills, host, fns } = setup({ values: ["Beta"] });
			pencil(rows()[1]).click();
			await rename("Zeta");
			expect(fns.rename).toHaveBeenCalledWith("Beta", "Zeta");
			expect(labels()[1]).toContain("Zeta");
			expect(headerPills()[0]?.textContent).toContain("Zeta");
			expect(host.values).toEqual(["Zeta"]);
			expect(editorEl()).toBeNull();
		});
		it("keeps everything when the rename fails", async () => {
			const { rows, labels, headerPills } = setup({ values: ["Beta"], rename: vi.fn(() => Promise.resolve(false)) });
			pencil(rows()[1]).click();
			await rename("Zeta");
			expect(labels()[1]).toContain("Beta");
			expect(headerPills()[0]?.textContent).toContain("Beta");
			expect(editorEl()).not.toBeNull();
		});
		it("recolors the option and keeps the editor open", async () => {
			const { rows, host, fns, popover } = setup();
			pencil(rows()[0]).click();
			editorEl()?.querySelector<HTMLElement>("[data-color='cyan']")?.click();
			await flush();
			expect(fns.recolor).toHaveBeenCalledWith("Alpha", "cyan");
			expect(host.options[0]?.color).toBe("cyan");
			expect(popover()?.querySelector(".improved-bases-picker-row .improved-bases-pill")?.getAttribute("data-color")).toBe("cyan");
			expect(editorEl()).not.toBeNull();
		});
		it("removes the option from the list and closes the editor", async () => {
			const { rows, labels, fns } = setup();
			pencil(rows()[0]).click();
			editorEl()?.querySelector<HTMLElement>(".improved-bases-option-editor-delete")?.click();
			await flush();
			expect(fns.remove).toHaveBeenCalledWith("Alpha");
			expect(labels()).toEqual(["Beta", "Gamma"]);
			expect(editorEl()).toBeNull();
		});
		it("closes the picker instead of leaking the error when a host action rejects", async () => {
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			const { rows, popover } = setup({ rename: vi.fn(() => Promise.reject(new Error("boom"))) });
			pencil(rows()[0]).click();
			await rename("Zeta");
			expect(popover()).toBeNull();
			expect(error).toHaveBeenCalledWith("Improved Bases: option picker failed", expect.any(Error));
		});
		it("stays open while a confirm modal is clicked", () => {
			const { rows, popover } = setup();
			pencil(rows()[0]).click();
			const modal = document.body.createDiv({ cls: "modal-container" }).createEl("button");
			modal.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
			expect(popover()).not.toBeNull();
			expect(editorEl()).not.toBeNull();
		});
		it("mousedown inside the editor does not close the picker; Escape closes only the editor", () => {
			const { rows, popover } = setup();
			pencil(rows()[0]).click();
			editorEl()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
			expect(popover()).not.toBeNull();
			editorEl()?.querySelector("input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			expect(editorEl()).toBeNull();
			expect(popover()).not.toBeNull();
		});
		it("closes the editor with the picker, and replaces it when another pencil is used", () => {
			const { rows, picker } = setup();
			pencil(rows()[0]).click();
			pencil(rows()[1]).click();
			expect(document.body.querySelectorAll(".improved-bases-option-editor").length).toBe(1);
			picker.close();
			expect(editorEl()).toBeNull();
		});
	});
});
