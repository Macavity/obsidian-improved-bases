import { setIcon } from "obsidian";
import { COLORS, type Color, type SelectOption } from "../schema/types";
import { placePopover } from "./placePopover";
import { dismissOnOutside } from "./popover";
import type { OverlayRegistry } from "./types";

export const OPTION_EDITOR_CLASS = "improved-bases-option-editor";

export interface OptionEditorHandlers {
	rename(to: string): Promise<boolean>;
	recolor(color: Color): Promise<boolean>;
	remove(): Promise<boolean>;
}

const WIDTH = 220;
const HEIGHT = 190;

/** Small popover at `document.body`, right-aligned below (or above) `anchor`, to rename, recolor or delete one option. Escape closes only the editor. */
export function openOptionEditor(
	anchor: HTMLElement,
	option: SelectOption,
	handlers: OptionEditorHandlers,
	overlays: OverlayRegistry,
): { close(): void } {
	const pos = placePopover(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { width: WIDTH, height: HEIGHT }, "end");
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
		swatch.addEventListener("click", () => {
			void handlers.recolor(color).then((ok) => {
				if (!ok) return;
				for (const other of Array.from(grid.children)) other.toggleClass("is-active", other === swatch);
			});
		});
	}
	// Buttons never take the focus from the input, so a click does not blur-save first.
	for (const el of [remove, ...Array.from(grid.children)]) el.addEventListener("mousedown", (evt) => evt.preventDefault());
	remove.addEventListener("click", () => void handlers.remove());

	let closed = false;
	const dismiss = dismissOnOutside((target) => popover.contains(target), () => {
		save();
		close();
	}, overlays);

	function close(): void {
		if (closed) return;
		closed = true;
		dismiss();
		popover.remove();
	}

	let busy = false;
	function save(): void {
		const to = input.value.trim();
		if (busy || !to || to === option.value) return;
		busy = true;
		input.disabled = true;
		void handlers.rename(to).finally(() => {
			busy = false;
			input.disabled = false;
		});
	}
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
