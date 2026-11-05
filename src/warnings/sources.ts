import type { Conflict } from "../schema/Membership";
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
