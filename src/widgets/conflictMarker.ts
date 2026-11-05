import { setIcon, setTooltip } from "obsidian";
import type { Resolution } from "../schema/Membership";
import type { FieldSchema } from "../schema/types";
import { t } from "../i18n";

const typeLabel = (field: FieldSchema): string => field.type;

/** Explains which definition applies and which others exist; `context` is the base of the surrounding view, if any. */
export function conflictText(propName: string, res: Resolution, context: string | null): string {
	const count = res.others.length + 1;
	const winner = t(res.basePath === context ? "conflict.showing" : "conflict.using", { base: res.basePath, type: typeLabel(res.field) });
	const rest = res.others.map((o) => t("conflict.definesAs", { base: o.basePath, type: typeLabel(o.field) })).join(", ");
	return t("conflict.text", { name: propName, n: count, winner, rest });
}

/** Appends an info icon with the explanation to `el`; clicks stay inside the icon (no picker, no cell edit). */
export function renderConflictMarker(el: HTMLElement, res: Resolution, propName: string, context: string | null): void {
	renderInfoMarker(el, conflictText(propName, res, context), "improved-bases-conflict");
}

/** Explains why a native override shows a value with another widget. */
export function mismatchText(value: unknown, overrideName: string, shownName: string): string {
	return t("mismatch.text", { value: JSON.stringify(value), type: overrideName, shown: shownName });
}

/** Appends an info icon with `text` as tooltip; `cls` keeps markers apart so each can be replaced on its own. */
export function renderInfoMarker(el: HTMLElement, text: string, cls: string): void {
	el.addClass("improved-bases-has-conflict");
	const marker = el.createSpan({ cls, attr: { "aria-label": text, tabindex: "-1" } });
	setIcon(marker, "info");
	if (typeof setTooltip === "function") setTooltip(marker, text, { placement: "top" });
	else marker.setAttribute("title", text);
	const stop = (evt: Event): void => {
		evt.preventDefault();
		evt.stopPropagation();
	};
	marker.addEventListener("click", stop, true);
	marker.addEventListener("mousedown", stop, true);
}
