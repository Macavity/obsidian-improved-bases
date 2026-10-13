import type { App, TFile } from "obsidian";
import { findOwnKey } from "./keys";

/** Returns the new value, or undefined when the note stays as it is. */
export type ValueEdit = (value: unknown) => unknown;

/** Applies `edit` to the value of `key` (case-insensitive) in each note, one file at a time; counts are per note. Failing notes count as failed. */
export async function migrateOptionValues(app: App, files: TFile[], key: string, edit: ValueEdit): Promise<{ changed: number; failed: number }> {
	const counts = { changed: 0, failed: 0 };
	for (const file of files) {
		try {
			await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				const own = findOwnKey(fm, key);
				if (own === undefined) return;
				const next = edit(fm[own]);
				if (next === undefined) return;
				fm[own] = next;
				counts.changed++;
			});
		} catch (e) {
			console.error(`Improved Bases: migrating option values in ${file.path} failed`, e);
			counts.failed++;
		}
	}
	return counts;
}
