import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { Conflict } from "../schema/Membership";
import type { BaseSchema, RelationField } from "../schema/types";
import { isRelation } from "../schema/types";
import { baseViewNames } from "../schema/baseViews";
import { t, tn } from "../i18n";

type Entry = { id: string; text: string; bases: string[] };

/** One state warning per base with schema errors. */
export function schemaWarnings(errors: Map<string, string[]>): Entry[] {
	return [...errors].map(([path, errs]) => ({ id: path, text: t("warning.schemaError", { path, error: errs.join("; ") }), bases: [path] }));
}

/** One state warning per field name and set of bases defining it for the same notes. */
export function conflictWarnings(conflicts: Conflict[]): Entry[] {
	return conflicts.map((c) => ({ id: `${c.name}\0${c.bases.join("\0")}`, text: tn("warning.conflict", c.files, { name: c.name, bases: c.bases.join(", ") }), bases: c.bases }));
}

/** Views of a base, read once per run; null when the base is missing or unreadable. */
type ViewCache = Map<string, Promise<string[] | null>>;

function viewsOf(app: App, cache: ViewCache, basePath: string): Promise<string[] | null> {
	let names = cache.get(basePath);
	if (!names) cache.set(basePath, (names = baseViewNames(app, basePath)));
	return names;
}

/** The warning text for one relation field, or null when its target base and view exist. */
async function relationProblem(app: App, cache: ViewCache, field: RelationField): Promise<string | null> {
	if (!(app.vault.getAbstractFileByPath(field.base) instanceof TFile)) return t("relation.targetMissing", { base: field.base });
	if (field.view === undefined) return null;
	const found = (await viewsOf(app, cache, field.base))?.includes(field.view);
	return found ? null : t("relation.viewMissing", { view: field.view, base: field.base });
}

/** One state warning per relation field whose target base is missing or whose view the target no longer has. */
export async function relationWarnings(app: App, schemas: BaseSchema[]): Promise<Entry[]> {
	const out: Entry[] = [];
	const cache: ViewCache = new Map();
	for (const schema of schemas) {
		for (const [key, { field }] of schema.fields) {
			if (!isRelation(field)) continue;
			const text = await relationProblem(app, cache, field);
			if (text !== null) out.push({ id: `${schema.basePath}:${key}`, text, bases: [schema.basePath] });
		}
	}
	return out;
}
