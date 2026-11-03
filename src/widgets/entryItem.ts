import type { App, TFile } from "obsidian";
import type { PickerItem } from "./pickers";

/** Inactive picker row for a note: the link text is relative to `sourcePath`. */
export function entryItem(app: App, file: TFile, sourcePath: string): PickerItem {
	return { raw: `[[${app.metadataCache.fileToLinktext(file, sourcePath, true)}]]`, file, label: file.basename, active: false, foreign: false };
}
