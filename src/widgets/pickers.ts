import { FuzzySuggestModal, Menu, renderMatches, type App, type FuzzyMatch, type MenuItem, type TFile } from "obsidian";
import { itemDom } from "../internals/menu";
import { COLORS, type Color } from "../schema/types";
import { renderIcon } from "./icons";
import type { OverlayRegistry } from "./types";

export interface PickerItem {
	raw: string;
	file: TFile | null;
	label: string;
	active: boolean;
	foreign: boolean;
}

/** Checkbox list of entries: a click toggles the entry and keeps the modal open. */
export class EntryPicker extends FuzzySuggestModal<PickerItem> {
	private readonly unregister: (() => void) | null;

	constructor(
		app: App,
		private readonly items: PickerItem[],
		private readonly iconOf: (item: PickerItem) => string,
		private readonly onToggle: (item: PickerItem) => void,
		overlays?: OverlayRegistry,
	) {
		super(app);
		this.unregister = overlays?.add(() => this.close()) ?? null;
		this.setPlaceholder("Filter entries");
		this.emptyStateText = "No entries";
	}

	getItems(): PickerItem[] {
		return this.items;
	}

	getItemText(item: PickerItem): string {
		return item.label;
	}

	getSuggestions(query: string): FuzzyMatch<PickerItem>[] {
		return super
			.getSuggestions(query)
			.map((match, index) => ({ match, index }))
			.sort((a, b) => Number(!a.match.item.active) - Number(!b.match.item.active) || a.index - b.index)
			.map(({ match }) => match);
	}

	renderSuggestion(match: FuzzyMatch<PickerItem>, el: HTMLElement): void {
		const item = match.item;
		el.addClass("improved-bases-entry");
		el.dataset.raw = item.raw;
		if (item.foreign) {
			el.addClass("is-foreign");
			el.title = "Not in target base";
		}
		const check = el.createEl("input", { cls: "improved-bases-entry-check", attr: { type: "checkbox", tabindex: "-1" } });
		check.checked = item.active;
		renderIcon(el.createSpan(), this.iconOf(item));
		renderMatches(el.createSpan({ cls: "improved-bases-entry-label" }), item.label, match.match.matches);
	}

	selectSuggestion(match: FuzzyMatch<PickerItem>): void {
		this.onToggle(match.item);
		const byRaw = new Map(this.items.map((i) => [i.raw, i]));
		for (const row of Array.from(this.resultContainerEl.querySelectorAll<HTMLElement>(".improved-bases-entry"))) {
			const item = byRaw.get(row.dataset.raw ?? "");
			const check = row.querySelector<HTMLInputElement>("input.improved-bases-entry-check");
			if (item && check) check.checked = item.active;
		}
	}

	onChooseItem(): void {}

	onClose(): void {
		super.onClose();
		this.unregister?.();
	}
}

const COLOR_LABELS: Record<Color, string> = {
	red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", lime: "Lime", cyan: "Cyan", blue: "Blue",
	violet: "Violet", pink: "Pink", brown: "Brown", grey: "Grey", black: "Black", white: "White",
};

function colorItem(item: MenuItem, title: string, color: Color): void {
	item.setTitle(title);
	const dom = itemDom(item);
	if (dom) {
		dom.addClass("improved-bases-menu-item");
		dom.setAttribute("data-color", color);
	}
}

function track(menu: Menu, overlays: OverlayRegistry): void {
	const off = overlays.add(() => menu.hide());
	menu.onHide(off);
}

/** Menu on an option chip in the schema dialog: rename, remove, then the colors (the current one checked). */
export function openOptionEditMenu(
	evt: MouseEvent,
	current: Color,
	handlers: { onRename: () => void; onRemove: () => void; onColor: (c: Color) => void },
	overlays: OverlayRegistry,
): void {
	const menu = new Menu();
	menu.setUseNativeMenu(false);
	track(menu, overlays);
	menu.addItem((item) => item.setTitle("Rename").setIcon("lucide-pencil").onClick(handlers.onRename));
	menu.addItem((item) => item.setTitle("Remove").setIcon("lucide-trash-2").onClick(handlers.onRemove));
	menu.addSeparator();
	for (const color of COLORS) {
		menu.addItem((item) => {
			colorItem(item, COLOR_LABELS[color], color);
			item.setChecked(color === current);
			item.onClick(() => handlers.onColor(color));
		});
	}
	menu.showAtMouseEvent(evt);
}
