import { getIcon, setIcon, type App, type TFile } from "obsidian";

export const DEFAULT_ICON = "📄";

function nonEmpty(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/** Icon of a target entry: the file's `icon` property, else the target base's default icon, else 📄. */
export function entryIcon(app: App, file: TFile | null, baseIcon: string | null): string {
	const fromFile = file ? nonEmpty(app.metadataCache.getFileCache(file)?.frontmatter?.icon) : null;
	return fromFile ?? nonEmpty(baseIcon) ?? DEFAULT_ICON;
}

/** Renders the icon text (an emoji); a value naming a built-in Obsidian icon is rendered as that icon. */
export function renderIcon(el: HTMLElement, icon: string): void {
	el.addClass("improved-bases-icon");
	if (getIcon(icon)) {
		setIcon(el, icon);
	} else if (getIcon(`lucide-${icon}`)) {
		setIcon(el, `lucide-${icon}`);
	} else {
		el.addClass("is-text");
		el.setText(icon);
	}
}
