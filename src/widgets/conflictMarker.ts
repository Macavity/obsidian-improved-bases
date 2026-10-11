import { setIcon, setTooltip } from "obsidian";
import type { Resolution } from "../schema/Membership";
import type { FieldSchema } from "../schema/types";

const typeLabel = (field: FieldSchema): string => field.type;

/** Explains which definition applies and which others exist; `context` is the base of the surrounding view, if any. */
export function conflictText(propName: string, res: Resolution, context: string | null): string {
	const count = res.others.length + 1;
	const winner = res.basePath === context
		? `Showing ${res.basePath} (${typeLabel(res.field)})`
		: `Using ${res.basePath} (${typeLabel(res.field)}, first by path)`;
	const rest = res.others.map((o) => `${o.basePath} defines it as ${typeLabel(o.field)}`).join(", ");
	return `${propName} is defined in ${count} bases. ${winner}; ${rest}.`;
}

/** Appends an info icon with the explanation to `el`; clicks stay inside the icon (no picker, no cell edit). */
export function renderConflictMarker(el: HTMLElement, res: Resolution, propName: string, context: string | null): void {
	const text = conflictText(propName, res, context);
	el.addClass("improved-bases-has-conflict");
	const marker = el.createSpan({ cls: "improved-bases-conflict", attr: { "aria-label": text, tabindex: "-1" } });
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
