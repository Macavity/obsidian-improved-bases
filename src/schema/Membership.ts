import { Events } from "obsidian";
import type { EventRef, MetadataCache, TFile } from "obsidian";
import type { BaseQuery } from "../query/BaseQuery";
import { targetKey, type QueryTarget } from "../query/target";
import type { SchemaRegistry } from "./SchemaRegistry";
import { isRelation, isSelect, type BaseSchema, type FieldSchema, type RelationField } from "./types";

const sig = (s: BaseSchema): string => JSON.stringify([s.icon ?? null, [...s.fields]]);

const QUIET_MS = 300;

const relationTarget = (f: RelationField): QueryTarget => (f.view === undefined ? { base: f.base } : { base: f.base, view: f.view });

/** Field names (lowercase) of relations pointing at the base `basePath` (any view); their widgets show its default icon. */
function relationsTargeting(schemas: BaseSchema[], basePath: string): string[] {
	const out: string[] = [];
	for (const s of schemas) for (const [k, f] of s.fields) if (isRelation(f.field) && f.field.base === basePath) out.push(k);
	return out;
}

/** Targets to watch by key: every schema base plus every relation target (with its view). */
function wantedTargets(schemas: BaseSchema[]): Map<string, QueryTarget> {
	const wanted = new Map<string, QueryTarget>();
	for (const s of schemas) {
		wanted.set(s.basePath, { base: s.basePath });
		for (const { field } of s.fields.values()) if (isRelation(field)) wanted.set(targetKey(relationTarget(field)), relationTarget(field));
	}
	return wanted;
}

/** Outcome of `resolveWithBase`: the definition that applies plus the competing ones (`others`, empty without a conflict). */
export interface Resolution {
	field: FieldSchema;
	basePath: string;
	name: string;
	others: { basePath: string; field: FieldSchema }[];
}

export interface MembershipDeps {
	/** Obsidian's metadata cache; the latch waits until it has resolved. Omitted = treated as resolved. */
	cache?: Pick<MetadataCache, "on" | "offref" | "resolvedLinks">;
	/** Quiet period without new pushes before results count as final. */
	quietMs?: number;
}

/**
 * File -> schema base mapping. Membership = the file is in the query result of a schema base.
 * Conflict rule: if several schema bases describe the same field for a file, the base of the view being rendered
 * wins when it is one of them, otherwise the first by basePath.
 */
export class Membership extends Events {
	private watches = new Map<string, () => void>();
	private results = new Map<string, TFile[]>();
	private members = new Map<string, Set<string>>();
	private known = new Map<string, string>();
	private oldSchemas = new Map<string, BaseSchema>();
	private warned = new Set<string>();
	private latched = false;
	private resolved: boolean;
	private quietTimer: number | null = null;
	private cacheRef: EventRef | null = null;
	private readonly quietMs: number;
	private readonly onRegistry = () => this.sync();

	constructor(
		private readonly registry: SchemaRegistry,
		private readonly query: BaseQuery,
		private readonly deps: MembershipDeps = {},
	) {
		super();
		this.quietMs = deps.quietMs ?? QUIET_MS;
		const { cache } = deps;
		this.resolved = !cache || Object.keys(cache.resolvedLinks).length > 0;
		if (cache) {
			this.cacheRef = cache.on("resolved", () => {
				this.resolved = true;
				this.armQuiet();
			});
		}
		this.registry.on("changed", this.onRegistry);
		this.sync();
	}

	/**
	 * True once results are final: registry loaded, every schema base scanned, metadata resolved,
	 * and no new push for the quiet period. `resolve` returns null before that.
	 */
	get ready(): boolean {
		return this.latched;
	}

	private get scanned(): boolean {
		const schemas = this.registry.schemas();
		return this.registry.loaded && schemas.length > 0 && schemas.every((s) => this.results.has(s.basePath));
	}

	private armQuiet(): void {
		if (this.latched) return;
		if (this.quietTimer !== null) window.clearTimeout(this.quietTimer);
		this.quietTimer = window.setTimeout(() => {
			this.quietTimer = null;
			if (this.latched || !this.resolved || !this.scanned) return;
			this.latched = true;
			this.emit(this.knownFieldNames());
		}, this.quietMs);
	}

	resolve(filePath: string, propName: string, preferredBase?: string | null): FieldSchema | null {
		return this.resolveWithBase(filePath, propName, preferredBase)?.field ?? null;
	}

	/**
	 * Like `resolve`, plus the winning schema base, the field's spelling in the schema and the other candidates.
	 * `preferredBase` (the base of the view being rendered) wins when it is a candidate; otherwise the first by path.
	 */
	resolveWithBase(filePath: string, propName: string, preferredBase?: string | null): Resolution | null {
		if (!this.latched) return null;
		const key = propName.toLowerCase();
		const candidates: { basePath: string; field: FieldSchema; name: string }[] = [];
		for (const schema of this.registry.schemas()) {
			if (!this.members.get(schema.basePath)?.has(filePath)) continue;
			const f = schema.fields.get(key);
			if (f) candidates.push({ basePath: schema.basePath, field: f.field, name: f.name });
		}
		const winner = candidates.find((c) => c.basePath === preferredBase) ?? candidates[0];
		if (!winner) return null;
		const others = candidates.filter((c) => c !== winner).map(({ basePath, field }) => ({ basePath, field }));
		if (others.length) {
			const id = `${filePath}\0${key}`;
			if (!this.warned.has(id)) {
				this.warned.add(id);
				console.warn(`Improved Bases: "${filePath}" is in several schema bases defining "${propName}": ${candidates.map((c) => c.basePath).join(", ")}`);
			}
		}
		return { field: winner.field, basePath: winner.basePath, name: winner.name, others };
	}

	/** Query result of a target by `targetKey` (= the path for a schema base); null while unknown. */
	targetEntries(key: string): TFile[] | null {
		return this.results.get(key) ?? null;
	}

	/** Default entry icon of a base (its schema's `icon`); null without one. */
	baseIcon(basePath: string): string | null {
		return this.registry.schemas().find((s) => s.basePath === basePath)?.icon ?? null;
	}

	knownFieldNames(): Set<string> {
		const out = new Set<string>();
		for (const s of this.registry.schemas()) for (const k of s.fields.keys()) out.add(k);
		return out;
	}

	/** Value shapes any schema allows for the field (lowercase name). */
	shapesFor(name: string): Set<"list" | "scalar" | "native"> {
		const out = new Set<"list" | "scalar" | "native">();
		for (const s of this.registry.schemas()) {
			const f = s.fields.get(name)?.field;
			if (!f) continue;
			if (isRelation(f) || isSelect(f)) out.add(f.multiple ? "list" : "scalar");
			else out.add("native");
		}
		return out;
	}

	dispose(): void {
		this.registry.off("changed", this.onRegistry);
		if (this.cacheRef) this.deps.cache?.offref(this.cacheRef);
		this.cacheRef = null;
		if (this.quietTimer !== null) window.clearTimeout(this.quietTimer);
		this.quietTimer = null;
		for (const stop of this.watches.values()) stop();
		this.watches.clear();
	}

	private emit(fields: Iterable<string>): void {
		const list = [...new Set(fields)].sort();
		if (list.length) this.trigger("changed", list);
	}

	private sync(): void {
		const schemas = this.registry.schemas();
		const wanted = wantedTargets(schemas);
		this.pruneWatches(wanted);
		const affected = this.affectedFields(schemas);
		for (const [key, target] of wanted) if (!this.watches.has(key)) this.watch(key, target);
		this.checkReady(affected);
	}

	/** Stops watching bases that no schema needs any more and forgets their results. */
	private pruneWatches(wanted: Map<string, QueryTarget>): void {
		for (const [path, stop] of [...this.watches]) {
			if (wanted.has(path)) continue;
			stop();
			this.watches.delete(path);
			this.results.delete(path);
			this.members.delete(path);
		}
	}

	/** Field names of every schema base whose definition changed since the last sync; updates the snapshot. */
	private affectedFields(schemas: BaseSchema[]): Set<string> {
		const affected = new Set<string>();
		const next = new Map(schemas.map((s) => [s.basePath, sig(s)]));
		const nextSchemas = new Map(schemas.map((s) => [s.basePath, s]));
		for (const path of new Set([...this.known.keys(), ...next.keys()])) {
			if (this.known.get(path) === next.get(path)) continue;
			for (const k of this.oldSchemas.get(path)?.fields.keys() ?? []) affected.add(k);
			for (const k of nextSchemas.get(path)?.fields.keys() ?? []) affected.add(k);
			for (const k of relationsTargeting(schemas, path)) affected.add(k);
		}
		this.oldSchemas = nextSchemas;
		this.known = next;
		return affected;
	}

	private watch(key: string, target: QueryTarget): void {
		this.watches.set(key, this.query.watch(target, (files, failed) => this.onResult(key, files, target.view !== undefined && failed === true)));
	}

	/** `unknown`: a view target whose query failed; its result is dropped so widgets treat it as not yet known. */
	private onResult(path: string, files: TFile[], unknown: boolean): void {
		if (unknown) {
			this.results.delete(path);
			this.members.delete(path);
		} else {
			this.results.set(path, files);
			this.members.set(path, new Set(files.map((f) => f.path)));
		}
		const schema = this.registry.schemas().find((s) => s.basePath === path);
		this.checkReady(schema ? schema.fields.keys() : []);
		if (this.latched && this.isRelationTarget(path)) this.trigger("targets-changed", path);
	}

	private isRelationTarget(key: string): boolean {
		for (const s of this.registry.schemas()) {
			for (const { field } of s.fields.values()) if (isRelation(field) && targetKey(relationTarget(field)) === key) return true;
		}
		return false;
	}

	private checkReady(affected: Iterable<string>): void {
		if (this.latched) this.emit(affected);
		else this.armQuiet();
	}
}
