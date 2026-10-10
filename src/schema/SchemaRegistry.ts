import { App, Events, Notice, TAbstractFile, TFile, parseYaml } from "obsidian";
import type { EventRef } from "obsidian";
import { parseSchema } from "./parse";
import type { BaseSchema } from "./types";

const sig = (s: BaseSchema): string => JSON.stringify([s.basePath, [...s.fields]]);

type Parsed = ReturnType<typeof parseSchema>;

/** Finds all `.base` files with a valid `improved-bases:` section; emits "changed" when the set of schemas or errors changes. */
export class SchemaRegistry extends Events {
	private byPath = new Map<string, BaseSchema>();
	private errs = new Map<string, string[]>();
	private refs: Array<{ off: () => void }> = [];
	private seqs = new Map<string, number>();
	private disposed = false;
	private started = false;
	private done = false;

	constructor(private readonly app: App) {
		super();
	}

	/** True once the initial scan of all `.base` files finished. */
	get loaded(): boolean {
		return this.done;
	}

	async load(): Promise<void> {
		if (this.disposed || this.started) return;
		this.started = true;
		const { vault } = this.app;
		const on = (ref: EventRef) => this.refs.push({ off: () => vault.offref(ref) });
		const isBase = (f: TAbstractFile): f is TFile => f instanceof TFile && f.extension === "base";
		on(vault.on("create", (f) => isBase(f) && void this.refresh(f.path)));
		on(vault.on("modify", (f) => isBase(f) && void this.refresh(f.path)));
		on(vault.on("delete", (f) => isBase(f) && void this.refresh(f.path)));
		on(vault.on("rename", (f, old) => {
			void this.refresh(old);
			if (isBase(f)) void this.refresh(f.path);
		}));
		const bases = vault.getFiles().filter((f) => f.extension === "base");
		await Promise.all(bases.map((f) => this.refresh(f.path, true)));
		if (this.disposed) return;
		this.done = true;
		this.trigger("changed");
	}

	dispose(): void {
		this.disposed = true;
		for (const r of this.refs.splice(0)) r.off();
	}

	schemas(): BaseSchema[] {
		return [...this.byPath.values()].sort((a, b) => (a.basePath < b.basePath ? -1 : a.basePath > b.basePath ? 1 : 0));
	}

	errors(): Map<string, string[]> {
		return new Map(this.errs);
	}

	private async refresh(path: string, silent = false): Promise<void> {
		const seq = (this.seqs.get(path) ?? 0) + 1;
		this.seqs.set(path, seq);
		const { schema, errors } = await this.read(path);
		if (this.seqs.get(path) !== seq) return;
		this.apply(path, schema, errors, silent);
	}

	/** Parses the `.base` at `path`; a missing or non-base file yields no schema and no errors. */
	private async read(path: string): Promise<Parsed> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== "base") return { schema: null, errors: [] };
		try {
			const raw: unknown = parseYaml(await this.app.vault.cachedRead(file));
			return parseSchema(path, raw);
		} catch (err) {
			return { schema: null, errors: [`invalid YAML: ${err instanceof Error ? err.message : String(err)}`] };
		}
	}

	/** Stores the result, notifies about new errors and emits "changed" when schema or errors differ. */
	private apply(path: string, schema: BaseSchema | null, errors: string[], silent: boolean): void {
		const schemaChanged = replace(this.byPath, path, schema, sig);
		const errChanged = replace(this.errs, path, errors.length ? errors : null, (e) => e.join("\n"));
		if (errChanged && errors.length) new Notice(`Improved Bases: ${path}: ${errors[0]}`);
		if (!silent && (schemaChanged || errChanged)) this.trigger("changed");
	}
}

/** Sets or deletes `map[path]`; true when the entry's signature changed. */
function replace<T>(map: Map<string, T>, path: string, next: T | null, signature: (v: T) => string): boolean {
	const prev = map.get(path);
	if (next) map.set(path, next);
	else map.delete(path);
	return (prev ? signature(prev) : "") !== (next ? signature(next) : "");
}
