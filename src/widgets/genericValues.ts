import type { App, TFile } from "obsidian";
import { findOwnKey, isUnsafeKey } from "../schema/keys";
import { toList } from "./values";

/** Generic select/relation accept empty values, a string or a list of strings. */
export function validateGeneric(value: unknown): boolean {
	if (value === null || value === undefined || value === "") return true;
	if (typeof value === "string") return true;
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Property `key` of a note (case-insensitive), undefined when absent. */
function valueOf(app: App, file: TFile, key: string): unknown {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	const own = fm && findOwnKey(fm, key);
	return fm && own !== undefined ? fm[own] : undefined;
}

/** Every value of the property `key` (case-insensitive) in all notes, most frequent first, then alphabetical; `anyList` when some note stores a list. */
export function collectValues(app: App, key: string): { values: string[]; anyList: boolean } {
	const counts = new Map<string, number>();
	let anyList = false;
	if (isUnsafeKey(key)) return { values: [], anyList };
	for (const file of app.vault.getMarkdownFiles()) {
		const raw = valueOf(app, file, key);
		anyList ||= Array.isArray(raw);
		for (const v of new Set(toList(raw))) counts.set(v, (counts.get(v) ?? 0) + 1);
	}
	const values = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
	return { values, anyList };
}

/** A list is multiple, a non-empty string is single; an empty value follows the vault (`anyList`, evaluated only then). */
export function isMultiple(value: unknown, anyList: () => boolean): boolean {
	if (Array.isArray(value)) return true;
	if (typeof value === "string" && value !== "") return false;
	return anyList();
}
