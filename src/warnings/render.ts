import { setIcon } from "obsidian";
import type { Warning } from "./WarningRegistry";
import { t } from "../i18n";

const basename = (path: string): string => (path.split("/").pop() ?? path).replace(/\.base$/, "");

export interface WarningRowHandlers {
	/** Opens the schema settings of a base; omitted where the row already sits in that dialog. */
	openBase?: (basePath: string) => void;
	dismiss: (id: string) => void;
}

/** One warning: kind icon, text, a link per base and, for an event, a dismiss button. */
export function renderWarningRow(parent: HTMLElement, warning: Warning, handlers: WarningRowHandlers): HTMLElement {
	const row = parent.createDiv({ cls: ["improved-bases-warning", warning.kind === "event" ? "is-event" : "is-state"], attr: { "data-warning-id": warning.id } });
	setIcon(row.createSpan({ cls: "improved-bases-warning-icon" }), warning.kind === "event" ? "lucide-alert-circle" : "lucide-alert-triangle");
	const body = row.createDiv({ cls: "improved-bases-warning-body" });
	body.createDiv({ cls: "improved-bases-warning-text", text: warning.text });
	const { openBase } = handlers;
	if (openBase && warning.bases.length) {
		const links = body.createDiv({ cls: "improved-bases-warning-bases" });
		for (const base of warning.bases) {
			const link = links.createEl("a", { cls: "improved-bases-warning-base", text: basename(base), attr: { href: "#", "aria-label": t("warnings.openSchema", { base }) } });
			link.addEventListener("click", (e) => {
				e.preventDefault();
				openBase(base);
			});
		}
	}
	if (warning.kind === "event") {
		const dismiss = row.createEl("button", { cls: "clickable-icon improved-bases-warning-dismiss", attr: { type: "button", "aria-label": t("warnings.dismiss") } });
		setIcon(dismiss, "lucide-x");
		dismiss.addEventListener("click", () => handlers.dismiss(warning.id));
	}
	return row;
}
