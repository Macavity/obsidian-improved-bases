import { FuzzySuggestModal, Menu, type App, type MenuItem, type TFile } from "obsidian";
import { itemDom, menuInternals } from "../internals/menu";
import { COLORS, type Color, type SelectField } from "../schema/types";
import type { OverlayRegistry } from "./types";

/** Picks one entry of a target base. */
export class EntryPicker extends FuzzySuggestModal<TFile> {
	private readonly unregister: (() => void) | null;

	constructor(
		app: App,
		private readonly entries: TFile[] | null,
		private readonly onPick: (file: TFile) => void,
		emptyText?: string,
		overlays?: OverlayRegistry,
	) {
		super(app);
		this.unregister = overlays?.add(() => this.close()) ?? null;
		this.setPlaceholder("Select an entry");
		if (emptyText) this.emptyStateText = emptyText;
	}

	getItems(): TFile[] {
		return this.entries ?? [];
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}

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
	const visible = (): { value: string }[] => rows.filter((r) => !r.dom?.hasClass("is-hidden"));
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
		const pick = exact?.value ?? (visible().length === 1 ? visible()[0]?.value : undefined);
		menu.hide();
		if (pick !== undefined) onPick(pick);
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
