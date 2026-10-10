import { isMap, parseDocument, type Pair } from "yaml";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { SCHEMA_KEY } from "./types";


const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

import type { RawFields } from "./baseDoc";
export type { RawFields } from "./baseDoc";

/** Edits only `improved-bases.fields`; everything else is preserved byte-for-byte. */
export function updateSchemaSource(source: string, mutate: (fields: RawFields) => void): string {
	const doc = parseDocument(source);
	const current = doc.getIn([SCHEMA_KEY, "fields"]);
	const before = (current && typeof (current as { toJSON?: unknown }).toJSON === "function"
		? (current as { toJSON: () => unknown }).toJSON()
		: {}) as RawFields;
	const after = structuredClone(before);
	mutate(after);

	if (same(before, after)) return source;

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
	return doc.toString();
}

/** Adds an empty `improved-bases: { fields: {} }` node; no-op if the key exists. */
export function activateSchemaSource(source: string): string {
	const doc = parseDocument(source);
	if (doc.has(SCHEMA_KEY)) return source;
	doc.setIn([SCHEMA_KEY, "fields"], doc.createNode({}));
	return doc.toString();
}

/** Replaces the whole `improved-bases` value with an empty schema, even if it was invalid. */
export function resetSchemaSource(source: string): string {
	const doc = parseDocument(source);
	doc.set(SCHEMA_KEY, { fields: {} });
	return doc.toString();
}

export class SchemaWriter {
	constructor(private readonly app: App) {}

	private fileOf(basePath: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(basePath);
		if (!(file instanceof TFile)) throw new Error(`Base not found: ${basePath}`);
		return file;
	}

	async update(basePath: string, mutate: (fields: RawFields) => void): Promise<void> {
		await this.app.vault.process(this.fileOf(basePath), (data) => updateSchemaSource(data, mutate));
	}

	async activate(basePath: string): Promise<void> {
		await this.app.vault.process(this.fileOf(basePath), activateSchemaSource);
	}

	async reset(basePath: string): Promise<void> {
		await this.app.vault.process(this.fileOf(basePath), resetSchemaSource);
	}
}
