import { setIcon } from "obsidian";
import type { Color, SelectOption } from "../schema/types";
import type { OverlayRegistry } from "./types";
import { openOptionEditor, OPTION_EDITOR_CLASS } from "./OptionEditor";
import { placePopover } from "./placePopover";
import { dismissOnOutside } from "./popover";
import { colorOf, renameValue } from "./values";

/** What the picker needs from the widget; the picker keeps working on its own copies after the cell re-renders. */
export interface OptionPickerHost {
	/** Own copy, the picker mutates it after successful host actions. */
	options: SelectOption[];
	/** Own copy. */
	values: string[];
	multiple: boolean;
	/** Writes the property. */
	commit(values: string[]): void;
	create(value: string): Promise<SelectOption | null>;
	recolor(value: string, color: Color): Promise<boolean>;
	rename(from: string, to: string): Promise<boolean>;
	remove(value: string): Promise<boolean>;
}

const MIN_WIDTH = 260;
const MAX_HEIGHT = 320;

type Row = { option: SelectOption; create?: never } | { create: string; option?: never };

/** Options matching the query (case-insensitive substring), plus a create row when no option equals it. */
function rowsFor(options: SelectOption[], query: string): Row[] {
	const q = query.trim();
	const lower = q.toLowerCase();
	const rows: Row[] = options.filter((o) => o.value.toLowerCase().includes(lower)).map((option) => ({ option }));
	if (q && !options.some((o) => o.value.toLowerCase() === lower)) rows.push({ create: q });
	return rows;
}

/** Values after picking `value`: single replaces (or clears the active value), multiple toggles; `add` never removes. */
function nextValues(values: string[], value: string, multiple: boolean, add: boolean): string[] {
	const remove = !add && values.includes(value);
	if (!multiple) return remove ? [] : [value];
	if (remove) return values.filter((v) => v !== value);
	return values.includes(value) ? values : [...values, value];
}

/** Click handler that keeps the focus in the input. */
function onPress(el: HTMLElement, action: () => void): void {
	el.addEventListener("mousedown", (evt) => evt.preventDefault());
	el.addEventListener("click", (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		action();
	});
}

/** Popover at `document.body` below (or above) the field: active values, a filter/create input and the option list. */
export function openOptionPicker(anchor: HTMLElement, host: OptionPickerHost, overlays: OverlayRegistry): { close(): void } {
	const rect = anchor.getBoundingClientRect();
	const pos = placePopover(rect, { width: window.innerWidth, height: window.innerHeight }, { width: MIN_WIDTH, height: MAX_HEIGHT });
	const popover = document.body.createDiv({ cls: "improved-bases-option-picker" });
	popover.toggleClass("is-above", pos.above);
	popover.setCssProps({
		"--ib-picker-left": `${pos.left}px`,
		"--ib-picker-width": `${pos.width}px`,
		"--ib-picker-max-height": `${MAX_HEIGHT}px`,
		// Above: anchored with its bottom edge at the field, so a short list does not float away from it.
		"--ib-picker-top": pos.above ? "auto" : `${pos.top}px`,
		"--ib-picker-bottom": pos.above ? `${Math.max(0, window.innerHeight - rect.top)}px` : "auto",
	});
	const header = popover.createDiv({ cls: "improved-bases-picker-header" });
	const pills = header.createDiv({ cls: "improved-bases-picker-values" });
	const input = header.createEl("input", { attr: { type: "text", placeholder: "Search or create", "aria-label": "Search or create" } });
	const list = popover.createDiv({ cls: "improved-bases-picker-list" });

	let rows: Row[] = [];
	let rowEls: HTMLElement[] = [];
	let selected = 0;
	let closed = false;
	let editor: { close(): void } | null = null;

	const dismiss = dismissOnOutside((target) => popover.contains(target) || !!target.closest(`.${OPTION_EDITOR_CLASS}`), () => close(), overlays);

	function close(): void {
		if (closed) return;
		closed = true;
		editor?.close();
		dismiss();
		popover.remove();
	}

	const fail = (e: unknown): void => {
		console.error("Improved Bases: option picker failed", e);
		close();
	};

	const setValues = (next: string[]): void => {
		host.values = next;
		host.commit([...next]);
	};

	const field = () => ({ type: "select" as const, multiple: host.multiple, options: host.options });

	const pill = (parent: HTMLElement, value: string): HTMLElement => {
		const el = parent.createSpan({ cls: "improved-bases-pill", attr: { "data-color": colorOf(field(), value) } });
		if (!host.options.some((o) => o.value === value)) el.setAttribute("title", "Not in options");
		el.createSpan({ cls: "improved-bases-pill-body", text: value });
		return el;
	};

	const renderHeader = (): void => {
		pills.empty();
		for (const [index, value] of host.values.entries()) {
			const remove = pill(pills, value).createEl("button", {
				cls: "improved-bases-chip-remove",
				text: "×",
				attr: { type: "button", "aria-label": `Remove ${value}` },
			});
			onPress(remove, () => {
				setValues(host.values.filter((_, i) => i !== index));
				render();
			});
		}
	};

	/** Moves the highlight without re-rendering, so a row under the mouse keeps its elements. */
	const highlight = (index: number): void => {
		selected = index;
		rowEls.forEach((el, i) => el.toggleClass("is-selected", i === index));
	};

	const renderRow = (row: Row, index: number): void => {
		if (row.create !== undefined) {
			const el = list.createDiv({ cls: "improved-bases-picker-create", text: `Create "${row.create}"` });
			el.toggleClass("is-selected", index === selected);
			el.addEventListener("mouseenter", () => highlight(index));
			rowEls.push(el);
			onPress(el, () => activate(row));
			return;
		}
		const active = host.values.includes(row.option.value);
		const el = list.createDiv({ cls: "improved-bases-picker-row" });
		el.toggleClass("is-active", active);
		el.toggleClass("is-selected", index === selected);
		el.addEventListener("mouseenter", () => highlight(index));
		rowEls.push(el);
		pill(el, row.option.value);
		const edit = el.createEl("button", {
			cls: "improved-bases-picker-edit",
			attr: { type: "button", "aria-label": `Edit option ${row.option.value}` },
		});
		setIcon(edit, "lucide-pencil");
		// The slot keeps its width without a check, so the pencils line up.
		el.createSpan({ cls: "improved-bases-picker-check", text: active ? "✓" : "" });
		onPress(edit, () => editOption(edit, row.option));
		onPress(el, () => activate(row));
	};

	const renderList = (): void => {
		list.empty();
		rowEls = [];
		rows = rowsFor(host.options, input.value);
		selected = Math.min(selected, Math.max(0, rows.length - 1));
		if (!host.options.length && !input.value.trim()) list.createDiv({ cls: "improved-bases-picker-hint", text: "Type to create an option" });
		rows.forEach(renderRow);
	};

	function render(): void {
		try {
			renderHeader();
			renderList();
		} catch (e) {
			fail(e);
		}
	}

	const editOption = (anchorEl: HTMLElement, option: SelectOption): void => {
		editor?.close();
		const value = option.value;
		const done = async (ok: Promise<boolean>, apply: () => void, closeEditor: boolean): Promise<boolean> => {
			if (!(await ok)) return false;
			apply();
			if (closeEditor) editor?.close();
			if (!closed) render();
			return true;
		};
		editor = openOptionEditor(
			anchorEl,
			option,
			{
				rename: (to) =>
					done(host.rename(value, to), () => {
						option.value = to;
						host.values = (renameValue(host.values, value, to) as string[] | undefined) ?? host.values;
					}, true),
				recolor: (color) => done(host.recolor(value, color), () => (option.color = color), false),
				remove: () => done(host.remove(value), () => (host.options = host.options.filter((o) => o !== option)), true),
			},
			overlays,
		);
	};

	const choose = (value: string, add: boolean): void => {
		setValues(nextValues(host.values, value, host.multiple, add));
		if (!host.multiple) return close();
		input.value = "";
		render();
	};

	const create = async (value: string): Promise<void> => {
		const option = await host.create(value);
		if (!option || closed) return;
		if (!host.options.some((o) => o.value === option.value)) host.options.push(option);
		choose(option.value, true);
	};

	function activate(row: Row | undefined): void {
		if (!row) return;
		if (row.create === undefined) choose(row.option.value, false);
		else create(row.create).catch(fail);
	}

	const handleKey = (key: string): boolean => {
		switch (key) {
			case "ArrowDown":
			case "ArrowUp":
				selected = Math.max(0, Math.min(rows.length - 1, selected + (key === "ArrowDown" ? 1 : -1)));
				render();
				return true;
			case "Enter":
				activate(rows[selected]);
				return true;
			case "Escape":
				close();
				return true;
			case "Backspace":
				if (input.value !== "" || !host.values.length) return false;
				setValues(host.values.slice(0, -1));
				render();
				return true;
			default:
				return false;
		}
	};

	input.addEventListener("keydown", (evt) => {
		if (!handleKey(evt.key)) return;
		evt.preventDefault();
		evt.stopPropagation();
	});
	input.addEventListener("input", () => {
		selected = 0;
		render();
	});

	render();
	input.focus();
	return { close };
}
