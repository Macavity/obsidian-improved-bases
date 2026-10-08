import { App, Events, Notice, TAbstractFile, TFile, parseYaml } from "obsidian";
import type { EventRef } from "obsidian";
import { parseSchema } from "./parse";
import type { BaseSchema } from "./types";

const sig = (s: BaseSchema): string => JSON.stringify([s.basePath, [...s.fields]]);

/** Finds all `.base` files with a valid `improved-bases:` section; emits "changed" when the set of schemas or errors changes. */
export class SchemaRegistry extends Events {
	private byPath = new Map<string, BaseSchema>();
	private errs = new Map<string, string[]>();
	private refs: Array<{ off: () => void }> = [];

	constructor(private readonly app: App) {
		super();
	}

	async load(): Promise<void> {
		const { vault } = this.app;
		const on = (ref: EventRef) => this.refs.push({ off: () => vault.offref(ref) });
		const isBase = (f: TAbstractFile): f is TFile => f instanceof TFile && f.extension === "base";
		on(vault.on("create", (f) => isBase(f) && void this.refresh(f.path)));
		on(vault.on("modify", (f) => isBase(f) && void this.refresh(f.path)));
		on(vault.on("delete", (f) => isBase(f) && void this.refresh(f.path)));
		on(vault.on("rename", (f, old) => {
			if (!isBase(f)) return;
			void this.refresh(old);
			void this.refresh(f.path);
		}));
		const bases = vault.getFiles().filter((f) => f.extension === "base");
		await Promise.all(bases.map((f) => this.refresh(f.path, true)));
		this.trigger("changed");
	}

	dispose(): void {
		for (const r of this.refs.splice(0)) r.off();
	}

	schemas(): BaseSchema[] {
		return [...this.byPath.values()].sort((a, b) => (a.basePath < b.basePath ? -1 : a.basePath > b.basePath ? 1 : 0));
	}

	errors(): Map<string, string[]> {
		return new Map(this.errs);
	}

	private async refresh(path: string, silent = false): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		let schema: BaseSchema | null = null;
		let errors: string[] = [];
		if (file instanceof TFile && file.extension === "base") {
			try {
				const raw: unknown = parseYaml(await this.app.vault.cachedRead(file));
				({ schema, errors } = parseSchema(path, raw));
			} catch (err) {
				errors = [`invalid YAML: ${err instanceof Error ? err.message : String(err)}`];
			}
		}
		const prevSchema = this.byPath.get(path);
		const prevErr = this.errs.get(path)?.join("\n");
		if (schema) this.byPath.set(path, schema);
		else this.byPath.delete(path);
		if (errors.length) this.errs.set(path, errors);
		else this.errs.delete(path);
		const schemaChanged = (prevSchema ? sig(prevSchema) : "") !== (schema ? sig(schema) : "");
		const errChanged = prevErr !== (errors.length ? errors.join("\n") : undefined);
		if (errChanged && errors.length) new Notice(`Improved Bases: ${path}: ${errors[0]}`);
		if (!silent && (schemaChanged || errChanged)) this.trigger("changed");
	}
}
