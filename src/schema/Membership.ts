import { Events } from "obsidian";
import type { TFile } from "obsidian";
import type { BaseQuery } from "../query/BaseQuery";
import type { SchemaRegistry } from "./SchemaRegistry";
import type { BaseSchema, FieldSchema } from "./types";

const sig = (s: BaseSchema): string => JSON.stringify([...s.fields]);

/**
 * File -> schema base mapping. Membership = the file is in the query result of a schema base.
 * Conflict rule: if several schema bases describe the same field for a file, the first by basePath wins.
 */
export class Membership extends Events {
	private watches = new Map<string, () => void>();
	private results = new Map<string, TFile[]>();
	private members = new Map<string, Set<string>>();
	private known = new Map<string, string>();
	private oldSchemas = new Map<string, BaseSchema>();
	private warned = new Set<string>();
	private latched = false;
	private readonly onRegistry = () => this.sync();

	constructor(private readonly registry: SchemaRegistry, private readonly query: BaseQuery) {
		super();
		this.registry.on("changed", this.onRegistry);
		this.sync();
	}

	get ready(): boolean {
		return this.registry.schemas().every((s) => this.results.has(s.basePath));
	}

	resolve(filePath: string, propName: string): FieldSchema | null {
		if (!this.latched) return null;
		const key = propName.toLowerCase();
		let winner: BaseSchema | null = null;
		let field: FieldSchema | null = null;
		for (const schema of this.registry.schemas()) {
			if (!this.members.get(schema.basePath)?.has(filePath)) continue;
			const f = schema.fields.get(key);
			if (!f) continue;
			if (!winner) {
				winner = schema;
				field = f.field;
			} else {
				const id = `${filePath}\0${key}`;
				if (!this.warned.has(id)) {
					this.warned.add(id);
					console.warn(`Improved Bases: "${filePath}" is in several schema bases defining "${propName}"; using ${winner.basePath}, ignoring ${schema.basePath}`);
				}
			}
		}
		return field;
	}

	schemaBaseOf(filePath: string): BaseSchema | null {
		return this.registry.schemas().find((s) => this.members.get(s.basePath)?.has(filePath)) ?? null;
	}

	targetEntries(basePath: string): TFile[] | null {
		return this.results.get(basePath) ?? null;
	}

	knownFieldNames(): Set<string> {
		const out = new Set<string>();
		for (const s of this.registry.schemas()) for (const k of s.fields.keys()) out.add(k);
		return out;
	}

	dispose(): void {
		this.registry.off("changed", this.onRegistry);
		for (const stop of this.watches.values()) stop();
		this.watches.clear();
	}

	private emit(fields: Iterable<string>): void {
		const list = [...new Set(fields)].sort();
		if (list.length) this.trigger("changed", list);
	}

	private sync(): void {
		const schemas = this.registry.schemas();
		const wanted = new Set<string>();
		for (const s of schemas) {
			wanted.add(s.basePath);
			for (const { field } of s.fields.values()) if (field.type === "relation") wanted.add(field.base);
		}
		for (const [path, stop] of [...this.watches]) {
			if (wanted.has(path)) continue;
			stop();
			this.watches.delete(path);
			this.results.delete(path);
			this.members.delete(path);
		}
		const affected = new Set<string>();
		const next = new Map<string, string>();
		for (const s of schemas) next.set(s.basePath, sig(s));
		const nextSchemas = new Map(schemas.map((s) => [s.basePath, s]));
		for (const path of new Set([...this.known.keys(), ...next.keys()])) {
			if (this.known.get(path) === next.get(path)) continue;
			for (const k of this.oldSchemas.get(path)?.fields.keys() ?? []) affected.add(k);
			for (const k of nextSchemas.get(path)?.fields.keys() ?? []) affected.add(k);
		}
		this.oldSchemas = nextSchemas;
		this.known = next;
		for (const path of wanted) if (!this.watches.has(path)) this.watch(path);
		this.checkReady(affected);
	}

	private watch(path: string): void {
		this.watches.set(path, this.query.watch(path, (files) => this.onResult(path, files)));
	}

	private onResult(path: string, files: TFile[]): void {
		this.results.set(path, files);
		this.members.set(path, new Set(files.map((f) => f.path)));
		const schema = this.registry.schemas().find((s) => s.basePath === path);
		this.checkReady(schema ? schema.fields.keys() : []);
	}

	private checkReady(affected: Iterable<string>): void {
		if (!this.latched && this.ready && this.registry.schemas().length > 0) {
			this.latched = true;
			this.emit(this.knownFieldNames());
			return;
		}
		if (this.latched) this.emit(affected);
	}
}
