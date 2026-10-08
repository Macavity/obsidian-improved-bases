import { FuzzySuggestModal, Menu, type Scope, type App, type MenuItem, type TFile } from "obsidian";
import { COLORS, type Color, type SelectField } from "../schema/types";

/** Picks one entry of a target base. */
export class EntryPicker extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly entries: TFile[] | null,
		private readonly onPick: (file: TFile) => void,
		emptyText?: string,
	) {
		super(app);
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
}

const COLOR_LABELS: Record<Color, string> = {
	red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", lime: "Lime", cyan: "Cyan", blue: "Blue",
	violet: "Violet", pink: "Pink", brown: "Brown", grey: "Grey", black: "Black", white: "White",
};

function colorItem(item: MenuItem, title: string, color: Color): void {
	item.setTitle(title);
	const dom = (item as MenuItem & { dom?: HTMLElement }).dom;
	if (dom) {
		dom.addClass("improved-bases-menu-item");
		dom.setAttribute("data-color", color);
	}
}

/** DOM menu (not native) listing the options as colored entries, with a search/create input on top. */
export function openOptionMenu(
	evt: MouseEvent,
	field: SelectField,
	current: string[],
	onPick: (value: string) => void,
	onCreate: (value: string) => void,
): void {
	const menu = new Menu();
	menu.setUseNativeMenu(false);
	const rows: { value: string; dom: HTMLElement | undefined }[] = [];
	for (const option of field.options) {
		menu.addItem((item) => {
			colorItem(item, option.value, option.color);
			item.setChecked(current.includes(option.value));
			item.onClick(() => onPick(option.value));
			rows.push({ value: option.value, dom: (item as MenuItem & { dom?: HTMLElement }).dom });
		});
	}
	menu.showAtMouseEvent(evt);

	const menuDom = (menu as Menu & { dom?: HTMLElement }).dom;
	if (!menuDom) return;
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
	// The menu's own scope swallows Enter before the input sees it: register ours on that scope and move it to the front.
	const scope = (menu as Menu & { scope?: Scope & { keys?: unknown[] } }).scope;
	if (scope) {
		const enter = scope.register([], "Enter", () => {
			submit();
			return false;
		});
		const keys = scope.keys;
		if (keys && keys[keys.length - 1] === enter) keys.unshift(keys.pop());
	}
	hint.addEventListener("click", (e) => {
		e.stopPropagation();
		const q = input.value.trim();
		menu.hide();
		if (q) onCreate(q);
	});
	window.setTimeout(() => input.focus(), 0);
}

/** DOM menu with the color palette. */
export function openColorMenu(evt: MouseEvent, onPick: (c: Color) => void): void {
	const menu = new Menu();
	menu.setUseNativeMenu(false);
	for (const color of COLORS) {
		menu.addItem((item) => {
			colorItem(item, COLOR_LABELS[color], color);
			item.onClick(() => onPick(color));
		});
	}
	menu.showAtMouseEvent(evt);
}
