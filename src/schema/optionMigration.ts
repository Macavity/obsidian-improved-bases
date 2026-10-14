import type { App, TFile } from "obsidian";
import { findOwnKey } from "./keys";

/** Returns the new value, or undefined when the note stays as it is. */
export type ValueEdit = (value: unknown) => unknown;

/**
 * One edit for all option renames and removals of a field: each original value is mapped at most once,
 * so swaps and chains stay intact. A removed string becomes null, removed list elements are dropped,
 * and an edited list never holds a value twice.
 */
export function optionValueEdit(renames: readonly { from: string; to: string }[], removals: readonly string[]): ValueEdit {
	const map = new Map<string, string | null>(renames.map((r) => [r.from, r.to]));
	for (const value of removals) map.set(value, null);
	const hit = (v: unknown): v is string => typeof v === "string" && map.has(v);
	return (value) => {
		if (typeof value === "string") return hit(value) ? map.get(value) : undefined;
		if (!Array.isArray(value) || !value.some(hit)) return undefined;
		const mapped = (value as unknown[]).flatMap((v) => (hit(v) ? (map.get(v) ?? []) : [v]));
		return [...new Set(mapped)];
	};
}

/** `values` with `from` renamed to `to`, without duplicates; the same rule the notes get. */
export function renameInList(values: string[], from: string, to: string): string[] {
	return (optionValueEdit([{ from, to }], [])(values) as string[] | undefined) ?? values;
}

/** Value of `key` (any case) in the frontmatter, or undefined when the key is missing. */
function valueOf(fm: Record<string, unknown> | undefined, keys: string[]): { found: boolean; value: unknown } {
	for (const key of fm ? keys : []) {
		const own = findOwnKey(fm as object, key);
		if (own !== undefined) return { found: true, value: (fm as Record<string, unknown>)[own] };
	}
	return { found: false, value: undefined };
}

/** Applies `edit` to `key` in the live frontmatter; whether it changed anything. */
async function editNote(app: App, file: TFile, key: string, edit: ValueEdit): Promise<boolean> {
	let changed = false;
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		const own = findOwnKey(fm, key);
		if (own === undefined) return;
		const next = edit(fm[own]);
		if (next === undefined) return;
		fm[own] = next;
		changed = true;
	});
	return changed;
}

/**
 * Applies `edit` to the value of `key` (case-insensitive) in each note, one file at a time; counts are per note.
 * Notes whose cached frontmatter shows nothing to change are not written; `previousKey` is where a just-renamed
 * key may still sit in the cache. Failing notes count as failed.
 */
export async function migrateOptionValues(app: App, files: TFile[], key: string, edit: ValueEdit, previousKey?: string): Promise<{ changed: number; failed: number }> {
	const counts = { changed: 0, failed: 0 };
	const keys = previousKey === undefined ? [key] : [key, previousKey];
	for (const file of files) {
		const cached = valueOf(app.metadataCache.getFileCache(file)?.frontmatter, keys);
		if (!cached.found || edit(cached.value) === undefined) continue;
		try {
			if (await editNote(app, file, key, edit)) counts.changed++;
		} catch (e) {
			console.error(`Improved Bases: migrating option values in ${file.path} failed`, e);
			counts.failed++;
		}
	}
	return counts;
}
