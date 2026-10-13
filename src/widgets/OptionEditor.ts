import { setIcon } from "obsidian";
import { COLORS, type Color, type SelectOption } from "../schema/types";
import { placePopover } from "./placePopover";
import type { OverlayRegistry } from "./types";

export const OPTION_EDITOR_CLASS = "improved-bases-option-editor";

export interface OptionEditorHandlers {
	rename(to: string): Promise<boolean>;
	recolor(color: Color): Promise<boolean>;
	remove(): Promise<boolean>;
}

const WIDTH = 220;
const HEIGHT = 190;

/** Small popover at `document.body` to rename, recolor or delete one option. Escape closes only the editor. */
export function openOptionEditor(
	anchor: HTMLElement,
	option: SelectOption,
	handlers: OptionEditorHandlers,
	overlays: OverlayRegistry,
): { close(): void } {
	const pos = placePopover(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { width: WIDTH, height: HEIGHT });
	const popover = document.body.createDiv({ cls: OPTION_EDITOR_CLASS });
	popover.setCssProps({
		"--ib-editor-left": `${pos.left}px`,
		"--ib-editor-top": `${pos.top}px`,
		"--ib-editor-width": `${WIDTH}px`,
	});
	const input = popover.createEl("input", { attr: { type: "text", "aria-label": "Option name" } });
	input.value = option.value;
	const remove = popover.createDiv({ cls: "improved-bases-option-editor-delete", attr: { role: "button", tabindex: "0" } });
	setIcon(remove.createSpan({ cls: "improved-bases-option-editor-icon" }), "lucide-trash-2");
	remove.createSpan({ text: "Delete" });
	const grid = popover.createDiv({ cls: "improved-bases-option-editor-colors" });
	for (const color of COLORS) {
		const swatch = grid.createEl("button", { attr: { type: "button", "data-color": color, "aria-label": color } });
		swatch.toggleClass("is-active", color === option.color);
		swatch.addEventListener("click", () => void handlers.recolor(color));
	}
	// Buttons never take the focus from the input, so a click does not blur-save first.
	for (const el of [remove, ...Array.from(grid.children)]) el.addEventListener("mousedown", (evt) => evt.preventDefault());
	remove.addEventListener("click", () => void handlers.remove());

	let closed = false;
	const onOutside = (evt: MouseEvent): void => {
		if (!popover.contains(evt.target as Node)) close();
	};
	document.addEventListener("mousedown", onOutside, true);
	const unregister = overlays.add(() => close());

	function close(): void {
		if (closed) return;
		closed = true;
		document.removeEventListener("mousedown", onOutside, true);
		unregister();
		popover.remove();
	}

	const save = (): void => {
		const to = input.value.trim();
		if (to && to !== option.value) void handlers.rename(to);
	};
	input.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter") save();
		else if (evt.key === "Escape") close();
		else return;
		evt.preventDefault();
		evt.stopPropagation();
	});
	input.addEventListener("blur", () => {
		if (!closed) save();
	});

	input.focus();
	input.select();
	return { close };
}
