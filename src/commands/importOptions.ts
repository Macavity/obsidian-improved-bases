import { Modal, Notice, parseYaml, TFile } from "obsidian";
import type { Plugin } from "obsidian";
import type { RawFields } from "../schema/SchemaWriter";
import { COLORS } from "../schema/types";
import type { Color } from "../schema/types";
import type { WidgetEnv } from "../widgets/types";

export interface OptionNote { basename: string; farbe: unknown }
export interface ImportPlan { fields: Record<string, Record<string, Color>>; skipped: string[]; obsoleteFormulas: string[] }

const SEPARATOR = " - ";

function validColor(v: unknown): v is Color {
	return typeof v === "string" && (COLORS as readonly string[]).includes(v);
}

/** Pure: maps `<column> - <value>` notes to select options of columns present in the members. */
export function planImport(notes: OptionNote[], memberProps: Set<string>, formulaNames: string[]): ImportPlan {
	const fields: Record<string, Record<string, Color>> = {};
	const spelling = new Map<string, string>();
	const skipped: string[] = [];

	for (const note of notes) {
		const at = note.basename.indexOf(SEPARATOR);
		const column = at > 0 ? note.basename.slice(0, at).trim() : "";
		const value = at > 0 ? note.basename.slice(at + SEPARATOR.length).trim() : "";
		if (!column || !value) {
			skipped.push(`${note.basename}: name is not "<column> - <value>"`);
			continue;
		}
		const key = column.toLowerCase();
		if (!memberProps.has(key)) continue;
		const name = spelling.get(key) ?? column;
		spelling.set(key, name);
		const options = (fields[name] ??= {});
		if (Object.hasOwn(options, value)) continue;
		let color: Color = "grey";
		if (validColor(note.farbe)) color = note.farbe;
		else skipped.push(`${note.basename}: missing or unknown color, using grey`);
		Object.defineProperty(options, value, { value: color, writable: true, enumerable: true, configurable: true });
	}

	const pills = new Set(Object.keys(fields).map((n) => `${n.replace(/ /g, "_")}_pill`.toLowerCase()));
	const obsoleteFormulas = formulaNames.filter((f) => pills.has(f.toLowerCase()));
	return { fields, skipped, obsoleteFormulas };
}

/**
 * Applies a plan to the schema fields: adds missing options, never overwrites colors,
 * never touches existing non-select fields. New fields are `multiple` when listed in `multiple`.
 */
export function importMutation(plan: ImportPlan["fields"], multiple: Set<string>): (fields: RawFields) => void {
	return (fields) => {
		for (const [name, options] of Object.entries(plan)) {
			const existing = Object.keys(fields).find((k) => k.toLowerCase() === name.toLowerCase());
			let field = existing ? fields[existing] : undefined;
			if (!field) {
				field = { type: "select", multiple: multiple.has(name), options: {} };
				fields[name] = field;
			}
			if (field.type !== "select") continue;
			const raw = field.options;
			const target: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
			field.options = target;
			for (const [value, color] of Object.entries(options)) {
				if (Object.hasOwn(target, value)) continue;
				Object.defineProperty(target, value, { value: color, writable: true, enumerable: true, configurable: true });
			}
		}
	};
}

class ResultModal extends Modal {
	constructor(plugin: Plugin, private readonly lines: { title: string; items: string[] }[]) {
		super(plugin.app);
	}

	onOpen(): void {
		this.setTitle("Option notes imported");
		for (const { title, items } of this.lines) {
			this.contentEl.createEl("h4", { text: title });
			if (items.length === 0) this.contentEl.createEl("p", { text: "None" });
			else this.contentEl.createEl("ul").append(...items.map((i) => createEl("li", { text: i })));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Registers command "import-option-notes" (name "Import option notes") for the active schema base. */
export function registerImportOptions(plugin: Plugin, env: WidgetEnv, getFolder: () => string): void {
	plugin.addCommand({
		id: "import-option-notes",
		name: "Import option notes",
		checkCallback: (checking) => {
			const base = env.app.workspace.getActiveFile();
			if (!base || base.extension !== "base") return false;
			if (!checking) void run(plugin, env, base.path, getFolder());
			return true;
		},
	});
}

async function run(plugin: Plugin, env: WidgetEnv, basePath: string, folder: string): Promise<void> {
	try {
		const members = env.membership.targetEntries(basePath);
		if (!members) {
			new Notice("Activate this base as a schema base first");
			return;
		}
		const cache = env.app.metadataCache;
		const memberProps = new Set<string>();
		const multiple = new Set<string>();
		const listKeys = new Set<string>();
		for (const file of members) {
			for (const [key, value] of Object.entries(cache.getFileCache(file)?.frontmatter ?? {})) {
				memberProps.add(key.toLowerCase());
				if (Array.isArray(value)) listKeys.add(key.toLowerCase());
			}
		}
		const prefix = `${folder.replace(/\/+$/, "")}/`;
		const notes: OptionNote[] = env.app.vault.getMarkdownFiles()
			.filter((f) => f.path.startsWith(prefix) && f.parent?.path === prefix.slice(0, -1))
			.map((f) => ({ basename: f.basename, farbe: cache.getFileCache(f)?.frontmatter?.Farbe as unknown }));

		const formulas = await readFormulaNames(env, basePath);
		const plan = planImport(notes, memberProps, formulas);
		for (const name of Object.keys(plan.fields)) if (listKeys.has(name.toLowerCase())) multiple.add(name);

		if (Object.keys(plan.fields).length > 0) await env.writer.update(basePath, importMutation(plan.fields, multiple));
		new ResultModal(plugin, [
			{ title: "Fields", items: Object.entries(plan.fields).map(([n, o]) => `${n}: ${Object.keys(o).join(", ")}`) },
			{ title: "Skipped", items: plan.skipped },
			{ title: "Formulas no longer needed", items: plan.obsoleteFormulas },
		]).open();
	} catch (e) {
		console.error("Improved Bases: import failed", e);
		new Notice("Import failed, see console");
	}
}

async function readFormulaNames(env: WidgetEnv, basePath: string): Promise<string[]> {
	const file = env.app.vault.getAbstractFileByPath(basePath);
	if (!(file instanceof TFile)) return [];
	const parsed: unknown = parseYaml(await env.app.vault.cachedRead(file));
	const formulas = (parsed as { formulas?: unknown } | null)?.formulas;
	return formulas && typeof formulas === "object" ? Object.keys(formulas) : [];
}
