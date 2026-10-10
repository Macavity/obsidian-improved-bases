import { parseDocument } from "yaml";

export type RawFields = Record<string, Record<string, unknown>>;

export interface BaseColumns {
	views: string[];
	orderByView: string[][];
	configured: string[];
	expressions: string[];
}

export interface ColumnEdits {
	add: { view: number; names: string[] }[];
	remove: string[];
	rename: { from: string; to: string }[];
}

export const EMPTY_EDITS: ColumnEdits = Object.freeze({
	add: Object.freeze([]) as unknown as ColumnEdits["add"],
	remove: Object.freeze([]) as unknown as ColumnEdits["remove"],
	rename: Object.freeze([]) as unknown as ColumnEdits["rename"],
});

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** "note.X" -> "X", "X" -> "X", file.* / formula.* / non-strings -> null. */
export function propertyName(entry: string): string | null {
	if (typeof entry !== "string" || entry === "") return null;
	if (entry.startsWith("file.") || entry.startsWith("formula.")) return null;
	const name = entry.startsWith("note.") ? entry.slice(5) : entry;
	return name === "" ? null : name;
}

function collectFilter(node: unknown, out: string[]): void {
	if (typeof node === "string") {
		out.push(node);
	} else if (Array.isArray(node)) {
		for (const n of node) collectFilter(n, out);
	} else if (isObj(node)) {
		for (const key of ["and", "or", "not"]) collectFilter(node[key], out);
	}
}

function viewColumns(view: Obj): string[] {
	if (!Array.isArray(view.order)) return [];
	const names: string[] = [];
	for (const entry of view.order) {
		const name = typeof entry === "string" ? propertyName(entry) : null;
		if (name !== null) names.push(name);
	}
	return names;
}

function viewName(view: Obj, i: number): string {
	return typeof view.name === "string" && view.name !== "" ? view.name : `View ${i + 1}`;
}

function configuredNames(properties: unknown): string[] {
	if (!isObj(properties)) return [];
	return Object.keys(properties)
		.filter((key) => key.startsWith("note.") && key.length > 5)
		.map((key) => key.slice(5));
}

function formulaExpressions(formulas: unknown): string[] {
	if (!isObj(formulas)) return [];
	return Object.values(formulas).filter((f): f is string => typeof f === "string");
}

export function readBaseColumns(source: string): BaseColumns {
	const doc = parseDocument(source);
	const [error] = doc.errors;
	if (error) throw new Error(error.message);
	const root = doc.toJSON() as unknown;
	const top: Obj = isObj(root) ? root : {};
	if (!Array.isArray(top.views)) throw new Error("Base file has no `views` list");

	const views = top.views.map((raw): Obj => (isObj(raw) ? raw : {}));
	const expressions: string[] = [];
	collectFilter(top.filters, expressions);
	for (const view of views) collectFilter(view.filters, expressions);
	expressions.push(...formulaExpressions(top.formulas));

	return {
		views: views.map(viewName),
		orderByView: views.map(viewColumns),
		configured: configuredNames(top.properties),
		expressions,
	};
}

export function referencesName(expressions: string[], name: string): boolean {
	if (name === "") return false;
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const lead = /^\w/.test(name) ? "\\b" : "";
	const trail = /\w$/.test(name) ? "\\b" : "";
	if (lead === "" || trail === "") return expressions.some((e) => e.includes(name));
	const re = new RegExp(`${lead}${escaped}${trail}`);
	return expressions.some((e) => re.test(e));
}
