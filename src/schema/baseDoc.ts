import { type Document, isMap, isScalar, isSeq, parseDocument, type Pair, type YAMLMap } from "yaml";
import { SCHEMA_KEY } from "./types";

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

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Maps an entry to its replacement: `null` = remove, string = rename, `undefined` = keep. */
type EntryEdit = (entry: string) => string | null | undefined;

function columnEdit(edits: ColumnEdits): EntryEdit {
	const removed = new Set(edits.remove.map((n) => n.toLowerCase()));
	const renamed = new Map(edits.rename.map((r) => [r.from.toLowerCase(), r.to]));
	return (entry) => {
		const name = propertyName(entry)?.toLowerCase();
		if (name === undefined) return undefined;
		if (removed.has(name)) return null;
		const to = renamed.get(name);
		if (to === undefined) return undefined;
		return entry.startsWith("note.") ? `note.${to}` : to;
	};
}

const scalarString = (node: unknown): string | null =>
	isScalar(node) && typeof node.value === "string" ? node.value : null;

/** Applies `edit` to every scalar in a list; `pick` locates the scalar inside an item. */
function editList(list: unknown, edit: EntryEdit, pick: (item: unknown) => unknown): void {
	if (!isSeq(list)) return;
	list.items = list.items.filter((item) => {
		const node = pick(item);
		const value = scalarString(node);
		const next = value === null ? undefined : edit(value);
		if (next === null) return false;
		if (typeof next === "string" && isScalar(node)) node.value = next;
		return true;
	});
}

function editKeys(map: unknown, edit: EntryEdit): void {
	if (!isMap(map)) return;
	map.items = map.items.filter((pair: Pair) => {
		const value = scalarString(pair.key);
		const next = value === null ? undefined : edit(value);
		if (next === null) return false;
		if (typeof next === "string" && isScalar(pair.key)) pair.key.value = next;
		return true;
	});
}

const propertyOf = (item: unknown): unknown => (isMap(item) ? item.get("property", true) : undefined);

function editView(view: YAMLMap, edit: EntryEdit): void {
	editList(view.get("order", true), edit, (item) => item);
	editKeys(view.get("summaries", true), edit);
	editList(view.get("sort", true), edit, propertyOf);
	const groupBy = view.get("groupBy", true);
	const value = scalarString(propertyOf(groupBy));
	const next = value === null ? undefined : edit(value);
	if (next === null) view.delete("groupBy");
	else if (typeof next === "string") (propertyOf(groupBy) as { value: unknown }).value = next;
}

function viewNodes(doc: Document): YAMLMap[] {
	const views = doc.get("views", true);
	return isSeq(views) ? views.items.filter((v): v is YAMLMap => isMap(v)) : [];
}

function addColumns(doc: Document, add: ColumnEdits["add"]): void {
	const views = doc.get("views", true);
	for (const { view, names } of add) {
		const node = isSeq(views) ? views.items[view] : undefined;
		if (!isMap(node)) throw new Error(`Invalid view index: ${view}`);
		const order = node.get("order", true);
		if (!isSeq(order)) {
			node.set("order", doc.createNode(["file.name", ...names]));
			continue;
		}
		const present = new Set(order.items.map((i) => propertyName(scalarString(i) ?? "")?.toLowerCase()));
		for (const name of names) {
			if (present.has(name.toLowerCase())) continue;
			present.add(name.toLowerCase());
			order.add(doc.createNode(name));
		}
	}
}

function applyColumnEdits(doc: Document, edits: ColumnEdits): void {
	addColumns(doc, edits.add);
	if (edits.remove.length === 0 && edits.rename.length === 0) return;
	const edit = columnEdit(edits);
	editKeys(doc.get("properties", true), edit);
	for (const view of viewNodes(doc)) editView(view, edit);
}

function fieldsOf(doc: Document): RawFields {
	const current = doc.getIn([SCHEMA_KEY, "fields"]);
	return (current && typeof (current as { toJSON?: unknown }).toJSON === "function"
		? (current as { toJSON: () => unknown }).toJSON()
		: {}) as RawFields;
}

/** Edits only `improved-bases.fields`, writing just the changed entries. */
function applySchemaMutation(doc: Document, mutate: (fields: RawFields) => void): void {
	const before = fieldsOf(doc);
	const after = structuredClone(before);
	mutate(after);
	if (same(before, after)) return;

	if (!doc.getIn([SCHEMA_KEY, "fields"])) {
		doc.setIn([SCHEMA_KEY, "fields"], doc.createNode({}));
	}
	for (const name of Object.keys(before)) {
		if (!Object.hasOwn(after, name)) doc.deleteIn([SCHEMA_KEY, "fields", name]);
	}
	for (const [name, value] of Object.entries(after)) {
		if (!same(before[name], value)) doc.setIn([SCHEMA_KEY, "fields", name], value);
	}
	// `setIn` appends; restore the caller's order so renamed fields keep their place.
	const map = doc.getIn([SCHEMA_KEY, "fields"]);
	if (isMap(map)) {
		const order = Object.keys(after);
		const index = (p: Pair): number => order.indexOf(String((p.key as { value?: unknown }).value ?? p.key));
		map.items.sort((a, b) => index(a) - index(b));
	}
}

/**
 * Applies column edits (view orders, properties, summaries, sort, groupBy) and the
 * schema mutation in one pass. Untouched nodes keep their formatting and comments;
 * filter and formula expressions are never rewritten.
 */
export function updateBaseSource(source: string, edits: ColumnEdits, mutate: (fields: RawFields) => void): string {
	const doc = parseDocument(source);
	const before = doc.toJSON() as unknown;
	applyColumnEdits(doc, edits);
	applySchemaMutation(doc, mutate);
	return same(before, doc.toJSON()) ? source : doc.toString();
}
