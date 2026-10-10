import { parseDocument } from "yaml";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { SCHEMA_KEY } from "./types";
import { EMPTY_EDITS, updateBaseSource, type ColumnEdits, type RawFields } from "./baseDoc";
export type { RawFields } from "./baseDoc";

/** Edits only `improved-bases.fields`; everything else is preserved byte-for-byte. */
export function updateSchemaSource(source: string, mutate: (fields: RawFields) => void): string {
	return updateBaseSource(source, EMPTY_EDITS, mutate);
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

	async updateBase(basePath: string, edits: ColumnEdits, mutate: (fields: RawFields) => void): Promise<void> {
		await this.app.vault.process(this.fileOf(basePath), (data) => updateBaseSource(data, edits, mutate));
	}

	async activate(basePath: string): Promise<void> {
		await this.app.vault.process(this.fileOf(basePath), activateSchemaSource);
	}

	async reset(basePath: string): Promise<void> {
		await this.app.vault.process(this.fileOf(basePath), resetSchemaSource);
	}
}
