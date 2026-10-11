import { FuzzySuggestModal, Menu, renderMatches, type App, type FuzzyMatch, type MenuItem, type TFile } from "obsidian";
import { itemDom, menuInternals } from "../internals/menu";
import { COLORS, type Color, type SelectField } from "../schema/types";
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
		for (const row of Array.from(this.resultContainerEl.querySelectorAll<HTMLElement>(".improved-bases-entry"))) {
			const item = this.items.find((i) => i.raw === row.dataset.raw);
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

/** Picks one of the given base paths. */
export class BasePicker extends FuzzySuggestModal<string> {
	constructor(app: App, private readonly paths: string[], private readonly onPick: (p: string) => void) {
		super(app);
		this.setPlaceholder("Select a target base");
	}
	getItems(): string[] {
		return this.paths;
	}
	getItemText(p: string): string {
		return p;
	}
	onChooseItem(p: string): void {
		this.onPick(p);
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

/** DOM menu (not native) listing the options as colored entries, with a search/create input on top. */
export function openOptionMenu(
	evt: MouseEvent,
	field: SelectField,
	current: string[],
	onPick: (value: string) => void,
	onCreate: (value: string) => void,
	overlays: OverlayRegistry,
): void {
	const menu = new Menu();
	menu.setUseNativeMenu(false);
	const rows: { value: string; dom: HTMLElement | null }[] = [];
	for (const option of field.options) {
		menu.addItem((item) => {
			colorItem(item, option.value, option.color);
			item.setChecked(current.includes(option.value));
			item.onClick(() => onPick(option.value));
			rows.push({ value: option.value, dom: itemDom(item) });
		});
	}
	track(menu, overlays);
	menu.showAtMouseEvent(evt);

	// Without the menu internals the options stay reachable by click, just without search/create.
	const internals = menuInternals(menu);
	if (!internals) return;
	const menuDom = internals.dom;
	const wrap = createDiv({ cls: "improved-bases-menu-search" });
	const input = wrap.createEl("input", { attr: { type: "text", placeholder: "Search or create", "aria-label": "Search or create" } });
	menuDom.prepend(wrap);
	const hint = menuDom.createDiv({ cls: "improved-bases-menu-create is-hidden" });
	const update = (): void => {
		const q = input.value.trim().toLowerCase();
		for (const r of rows) r.dom?.toggleClass("is-hidden", q !== "" && !r.value.toLowerCase().includes(q));
		const exact = rows.some((r) => r.value.toLowerCase() === q);
		hint.toggleClass("is-hidden", q === "" || exact);
		hint.setText(`Create "${input.value.trim()}"`);
	};
	input.addEventListener("input", update);
	const submit = (): void => {
		const q = input.value.trim();
		if (!q) return;
		const exact = rows.find((r) => r.value.toLowerCase() === q.toLowerCase());
		menu.hide();
		if (exact) onPick(exact.value);
		else onCreate(q);
	};
	internals.onEnter(submit);
	hint.addEventListener("click", (e) => {
		e.stopPropagation();
		const q = input.value.trim();
		menu.hide();
		if (q) onCreate(q);
	});
	window.setTimeout(() => input.focus(), 0);
}

/** DOM menu with the color palette. */
export function openColorMenu(evt: MouseEvent, onPick: (c: Color) => void, overlays: OverlayRegistry): void {
	const menu = new Menu();
	menu.setUseNativeMenu(false);
	track(menu, overlays);
	for (const color of COLORS) {
		menu.addItem((item) => {
			colorItem(item, COLOR_LABELS[color], color);
			item.onClick(() => onPick(color));
		});
	}
	menu.showAtMouseEvent(evt);
}
