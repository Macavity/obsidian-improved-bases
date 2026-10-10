import { Modal, normalizePath, Notice, parseYaml, TFile } from "obsidian";
import type { MetadataCache, Plugin } from "obsidian";
import type { RawFields } from "../schema/SchemaWriter";
import { isColor } from "../schema/types";
import type { Color } from "../schema/types";
import { findOwnKey, isUnsafeKey, setOption } from "../schema/keys";
import { isRecord } from "../schema/parse";
import type { WidgetEnv } from "../widgets/types";

export interface OptionNote { basename: string; farbe: unknown }
export interface ImportPlan { fields: Record<string, Record<string, Color>>; skipped: string[]; obsoleteFormulas: string[] }

const SEPARATOR = " - ";

/** Pure: splits `<column> - <value>` at the first separator; null when either side is empty. */
export function splitNoteName(basename: string): { column: string; value: string } | null {
	const at = basename.indexOf(SEPARATOR);
	if (at <= 0) return null;
	const column = basename.slice(0, at).trim();
	const value = basename.slice(at + SEPARATOR.length).trim();
	return column && value ? { column, value } : null;
}

/** Color of a note's `Farbe` property; unknown or missing falls back to grey and is reported. */
function colorOf(note: OptionNote, skipped: string[]): Color {
	if (isColor(note.farbe)) return note.farbe;
	skipped.push(`${note.basename}: missing or unknown color, using grey`);
	return "grey";
}

/** Pure: maps `<column> - <value>` notes to select options of columns present in the members. */
export function planImport(notes: OptionNote[], memberProps: Set<string>, formulaNames: string[]): ImportPlan {
	const fields: Record<string, Record<string, Color>> = Object.create(null) as Record<string, Record<string, Color>>;
	const spelling = new Map<string, string>();
	const skipped: string[] = [];

	for (const note of notes) {
		const parts = splitNoteName(note.basename);
		if (!parts) {
			skipped.push(`${note.basename}: name is not "<column> - <value>"`);
			continue;
		}
		const { column, value } = parts;
		if (isUnsafeKey(column) || isUnsafeKey(value)) {
			skipped.push(`${note.basename}: reserved name`);
			continue;
		}
		const key = column.toLowerCase();
		if (!memberProps.has(key)) continue;
		const name = spelling.get(key) ?? column;
		spelling.set(key, name);
		const options = (fields[name] ??= Object.create(null) as Record<string, Color>);
		if (!Object.hasOwn(options, value)) options[value] = colorOf(note, skipped);
	}

	const pills = new Set(Object.keys(fields).map((n) => `${n.replace(/ /g, "_")}_pill`.toLowerCase()));
	const obsoleteFormulas = formulaNames.filter((f) => pills.has(f.toLowerCase()));
	return { fields, skipped, obsoleteFormulas };
}

/** The select field named `name` (created when missing); null when an existing field is not a select. */
function ensureSelectField(fields: RawFields, name: string, multiple: boolean): RawFields[string] | null {
	const existing = findOwnKey(fields, name);
	const field = existing ? fields[existing] : undefined;
	if (!field) return (fields[name] = { type: "select", multiple, options: {} });
	return field.type === "select" ? field : null;
}

/**
 * Applies a plan to the schema fields: adds missing options, never overwrites colors,
 * never touches existing non-select fields. New fields are `multiple` when listed in `multiple`.
 */
export function importMutation(
	plan: ImportPlan["fields"],
	multiple: Set<string>,
	onSkipped: (name: string) => void = () => undefined,
): (fields: RawFields) => void {
	return (fields) => {
		for (const [name, options] of Object.entries(plan)) {
			if (isUnsafeKey(name)) continue;
			const field = ensureSelectField(fields, name, multiple.has(name));
			if (!field) {
				onSkipped(name);
				continue;
			}
			const target: Record<string, unknown> = isRecord(field.options) ? field.options : {};
			field.options = target;
			for (const [value, color] of Object.entries(options)) {
				if (isUnsafeKey(value) || Object.hasOwn(target, value)) continue;
				setOption(target, value, color);
			}
		}
	};
}

class ResultModal extends Modal {
	constructor(plugin: Plugin, private readonly heading: string, private readonly lines: { title: string; items: string[] }[]) {
		super(plugin.app);
	}

	onOpen(): void {
		this.setTitle(this.heading);
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

/** Lowercased property names of the member notes, and those whose value is a list. */
function collectMemberProps(cache: MetadataCache, members: TFile[]): { memberProps: Set<string>; listKeys: Set<string> } {
	const memberProps = new Set<string>();
	const listKeys = new Set<string>();
	for (const file of members) {
		for (const [key, value] of Object.entries(cache.getFileCache(file)?.frontmatter ?? {})) {
			memberProps.add(key.toLowerCase());
			if (Array.isArray(value)) listKeys.add(key.toLowerCase());
		}
	}
	return { memberProps, listKeys };
}

/** Markdown notes directly inside `folder`, with their `Farbe` property. */
function findOptionNotes(env: WidgetEnv, folder: string): { dir: string; notes: OptionNote[] } {
	const cache = env.app.metadataCache;
	const dir = normalizePath(folder.trim());
	const notes = env.app.vault.getMarkdownFiles()
		.filter((f) => f.path.startsWith(`${dir}/`) && f.parent?.path === dir)
		.map((f) => ({ basename: f.basename, farbe: cache.getFileCache(f)?.frontmatter?.Farbe as unknown }));
	return { dir, notes };
}

function showResult(plugin: Plugin, plan: ImportPlan, notSelect: Set<string>): void {
	const written = Object.entries(plan.fields).filter(([n]) => !notSelect.has(n));
	const skipped = [...plan.skipped, ...[...notSelect].map((n) => `${n}: existing field is not a select`)];
	new ResultModal(plugin, written.length === 0 ? "Nothing to import" : "Option notes imported", [
		{ title: "Fields", items: written.map(([n, o]) => `${n}: ${Object.keys(o).join(", ")}`) },
		{ title: "Skipped", items: skipped },
		{ title: "Formulas no longer needed", items: plan.obsoleteFormulas },
	]).open();
}

async function run(plugin: Plugin, env: WidgetEnv, basePath: string, folder: string): Promise<void> {
	try {
		const members = env.membership.targetEntries(basePath);
		if (!members) {
			new Notice("Activate this base as a schema base first");
			return;
		}
		const { memberProps, listKeys } = collectMemberProps(env.app.metadataCache, members);
		const { dir, notes } = findOptionNotes(env, folder);
		if (notes.length === 0) {
			new Notice(`No option notes found in ${dir}`);
			return;
		}
		const plan = planImport(notes, memberProps, await readFormulaNames(env, basePath));
		const multiple = new Set(Object.keys(plan.fields).filter((name) => listKeys.has(name.toLowerCase())));
		const notSelect = new Set<string>();
		if (Object.keys(plan.fields).length > 0) {
			await env.writer.update(basePath, importMutation(plan.fields, multiple, (n) => notSelect.add(n)));
		}
		showResult(plugin, plan, notSelect);
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
