import { describe, it, expect, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { EntryPicker, type PickerItem } from "../src/widgets/pickers";
import { OverlayRegistry } from "../src/widgets/types";

/** The test mock of FuzzySuggestModal adds this helper; the real typings do not have it. */
type MockPicker = EntryPicker & { renderAll(q: string): void };

const item = (p: Partial<PickerItem>): PickerItem => ({ raw: "[[X]]", file: new TFile(), label: "X", active: false, foreign: false, ...p });
const open = (items: PickerItem[], onToggle = vi.fn()) => {
	const overlays = new OverlayRegistry();
	const picker = new EntryPicker({} as App, items, (i) => (i.active ? "✅" : "📄"), onToggle, overlays) as MockPicker;
	picker.open();
	return { picker, overlays, onToggle, rows: () => Array.from(picker.resultContainerEl.querySelectorAll<HTMLElement>(".improved-bases-entry")) };
};

describe("EntryPicker", () => {
	it("lists active entries first, also while filtering", () => {
		const { picker } = open([item({ raw: "[[B]]", label: "Beta" }), item({ raw: "[[A]]", label: "Alpha", active: true }), item({ raw: "[[C]]", label: "Cab" })]);
		expect(picker.getSuggestions("").map((m) => m.item.label)).toEqual(["Alpha", "Beta", "Cab"]);
		expect(picker.getSuggestions("a").map((m) => m.item.label)).toEqual(["Alpha", "Beta", "Cab"]);
	});
	it("renders checkbox, icon and foreign marker", () => {
		const { picker, rows } = open([item({ raw: "[[A]]", label: "Alpha", active: true, foreign: true }), item({ raw: "[[B]]", label: "Beta" })]);
		picker.renderAll("");
		const [a, b] = rows();
		expect(a?.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked).toBe(true);
		expect(b?.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked).toBe(false);
		expect(a?.classList.contains("is-foreign")).toBe(true);
		expect(a?.querySelector(".improved-bases-icon")?.textContent).toBe("✅");
		expect(a?.querySelector(".improved-bases-entry-label")?.textContent).toBe("Alpha");
	});
	it("toggles without closing and mirrors the item state", () => {
		const items = [item({ raw: "[[A]]", label: "Alpha" })];
		const onToggle = vi.fn((i: PickerItem) => {
			i.active = !i.active;
		});
		const { picker, rows } = open(items, onToggle);
		picker.renderAll("");
		const close = vi.spyOn(picker, "close");
		rows()[0]?.click();
		expect(onToggle).toHaveBeenCalledWith(items[0]);
		expect(close).not.toHaveBeenCalled();
		expect(rows()[0]?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
	});
	it("closes through the overlay registry", () => {
		const { picker, overlays } = open([]);
		const close = vi.spyOn(picker, "close");
		overlays.closeAll();
		expect(close).toHaveBeenCalled();
	});
});
