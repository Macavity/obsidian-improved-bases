import { getFrontMatterInfo, Notice, parseYaml, TFile, type App, type Plugin } from "obsidian";
import { installSchemaButton } from "../internals/toolbar";
import { firstResult } from "../query/BaseQuery";
import type { SchemaRegistry } from "../schema/SchemaRegistry";
import type { WidgetEnv } from "../widgets/types";
import { SchemaSettingsModal, type SchemaSettingsHandlers, type SchemaSettingsInput } from "./SchemaSettingsModal";
import { draftsToEdits, knownFieldDrafts, optionMigrations, removals, renameKey, renames, type FieldDraft, type OptionMigration, type OtherDefinition, type TypeChoice } from "./schemaDraft";
import { migrateOptionValues, optionValueEdit } from "../schema/optionMigration";
import type { Membership } from "../schema/Membership";
import { readBaseColumns, referencesName, type BaseColumns } from "../schema/baseDoc";
import { getMetadataTypeManager } from "../internals/detect";
import { listPropertyTypes } from "../internals/typeRegistry";
import { findOwnKey } from "../schema/keys";
import { baseViewNames } from "../schema/baseViews";
import { t, tn } from "../i18n";

type Pairs = { from: string; to: string }[];
type Counts = { renamed: number; conflict: number; failed: number };

type State = SchemaSettingsInput["state"];


/** Modal state for a base: its known fields, or the schema errors. */
export function schemaState(registry: SchemaRegistry, basePath: string, columns: BaseColumns, memberKeys: string[], detected: (name: string) => string | null, currentView: number): State {
	const errors = registry.errors().get(basePath);
	if (errors) return { kind: "error", message: errors.join("; "), resettable: true };
	const schemaFields = registry.schemas().find((s) => s.basePath === basePath)?.fields ?? null;
	return { kind: "fields", drafts: knownFieldDrafts({ columns, schemaFields, memberKeys, detected, currentView }) };
}

type KeyMatch = (fm: object, name: string) => boolean;
const exactKey: KeyMatch = (fm, name) => Object.hasOwn(fm, name);
/** Obsidian treats property names case-insensitively. */
const anyCaseKey: KeyMatch = (fm, name) => findOwnKey(fm, name) !== undefined;

/**
 * The names whose key the note's frontmatter on disk has; `processFrontMatter` rewrites a note even
 * when nothing changes, so only notes that need it are passed on. Unparseable frontmatter counts as
 * "maybe" (all names) and is left to `processFrontMatter`, which then reports the failure.
 */
async function namesPresent(app: App, file: TFile, names: string[], match: KeyMatch): Promise<string[]> {
	const info = getFrontMatterInfo(await app.vault.cachedRead(file));
	if (!info.exists) return [];
	try {
		const fm: unknown = parseYaml(info.frontmatter);
		return typeof fm === "object" && fm !== null ? names.filter((n) => match(fm, n)) : [];
	} catch {
		return names;
	}
}

/** Renames frontmatter keys (exact spelling) in one note; null when the note has none of them. `conflicts` holds the target names that already existed. */
async function renameInNote(app: App, file: TFile, pairs: Pairs): Promise<{ renamed: boolean; conflicts: string[] } | null> {
	const present = await namesPresent(app, file, pairs.map((p) => p.from), exactKey);
	if (!present.length) return null;
	const outcome = { renamed: false, conflicts: [] as string[] };
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		for (const { from, to } of pairs) {
			const result = renameKey(fm, from, to);
			if (result === "renamed") outcome.renamed = true;
			else if (result === "conflict") outcome.conflicts.push(to);
		}
	});
	return outcome;
}

/** Notes per lower-cased target name whose rename hit a conflict (both keys present). */
export type RenameConflicts = Map<string, Set<TFile>>;

/**
 * Renames frontmatter keys in the notes that have one of them, one file at a time; counts are per note.
 * Unreadable notes count as failed. Conflicting notes are added to `conflicts` when given.
 */
export async function migrateRenames(app: App, files: TFile[], pairs: Pairs, conflicts?: RenameConflicts): Promise<Counts> {
	const counts: Counts = { renamed: 0, conflict: 0, failed: 0 };
	for (const file of files) {
		try {
			const outcome = await renameInNote(app, file, pairs);
			if (outcome?.renamed) counts.renamed++;
			if (outcome?.conflicts.length) counts.conflict++;
			for (const to of outcome?.conflicts ?? []) {
				const key = to.toLowerCase();
				conflicts?.set(key, (conflicts.get(key) ?? new Set()).add(file));
			}
		} catch (e) {
			console.error(`Improved Bases: renaming properties in ${file.path} failed`, e);
			counts.failed++;
		}
	}
	return counts;
}

/** Notice text for a rename; `counts` is null when the base members were unknown. */
export function renameSummary(pairs: Pairs, counts: Counts | null): string {
	if (!pairs.length) return "";
	if (counts === null) return t("save.notRenamed");
	const label = pairs.map((p) => `${p.from} → ${p.to}`).join(", ");
	const parts = [tn("save.renamed", counts.renamed, { label })];
	if (counts.conflict > 0) parts.push(t("save.skippedBothKeys", { n: counts.conflict }));
	if (counts.failed > 0) parts.push(t("save.failed", { n: counts.failed }));
	return parts.join(", ");
}

type Removal = { name: string; removed: number; failed: number };

/** Deletes every own key matching `name` case-insensitively; whether any existed. */
function deleteAnyCase(fm: Record<string, unknown>, name: string): boolean {
	const lower = name.toLowerCase();
	const keys = Object.keys(fm).filter((k) => k.toLowerCase() === lower);
	for (const k of keys) delete fm[k];
	return keys.length > 0;
}

/** Deletes the names' keys from one note in a single write; the names that were deleted. */
async function deleteFromNote(app: App, file: TFile, names: string[]): Promise<string[]> {
	const deleted: string[] = [];
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		for (const name of names) if (deleteAnyCase(fm, name)) deleted.push(name);
	});
	return deleted;
}

function tally(results: Removal[], names: string[], field: "removed" | "failed"): void {
	for (const r of results) if (names.includes(r.name)) r[field]++;
}

/**
 * Deletes the keys (any case) from the notes that have one of them, one write per note.
 * Returns one entry per name, in input order, counting notes. A failed write counts as failed for every
 * name the note had on disk; an unreadable note counts as failed for every name.
 */
export async function removeProperties(app: App, files: TFile[], names: string[]): Promise<Removal[]> {
	const results = names.map((name) => ({ name, removed: 0, failed: 0 }));
	for (const file of files) {
		let present = names;
		try {
			present = await namesPresent(app, file, names, anyCaseKey);
			if (present.length) tally(results, await deleteFromNote(app, file, present), "removed");
		} catch (e) {
			console.error(`Improved Bases: removing properties from ${file.path} failed`, e);
			tally(results, present, "failed");
		}
	}
	return results;
}

/** Number of notes whose frontmatter on disk has the key in any case. */
export async function countNotesWithKey(app: App, files: TFile[], name: string): Promise<number> {
	let count = 0;
	for (const file of files) if ((await namesPresent(app, file, [name], anyCaseKey)).length) count++;
	return count;
}

type OptionCounts = { changed: number; failed: number; conflict: number };

/**
 * Renames and removes option values in the notes, one pass per field with all its changes at once.
 * `fieldRenames` are this save's field renames: their notes are looked up under both names, and notes
 * whose field rename hit a conflict are skipped, since their value under the new name is not the migrated one.
 */
async function migrateOptions(app: App, files: TFile[], migrations: OptionMigration[], fieldRenames: Pairs, conflicts: RenameConflicts): Promise<OptionCounts> {
	const counts: OptionCounts = { changed: 0, failed: 0, conflict: 0 };
	for (const { field, renames: pairs, removals: values } of migrations) {
		const skip = conflicts.get(field.toLowerCase()) ?? new Set<TFile>();
		const previous = fieldRenames.find((p) => p.to.trim().toLowerCase() === field.toLowerCase())?.from;
		const r = await migrateOptionValues(app, files.filter((f) => !skip.has(f)), field, optionValueEdit(pairs, values), previous);
		counts.changed += r.changed;
		counts.failed += r.failed;
		counts.conflict += files.filter((f) => skip.has(f)).length;
	}
	return counts;
}

/** Notice line for option migrations; `counts` is null when the base members were unknown. */
export function optionSummary(counts: OptionCounts | null): string {
	if (counts === null) return t("save.notMigrated");
	const parts = [tn("save.optionsUpdated", counts.changed)];
	if (counts.failed > 0) parts.push(t("save.failed", { n: counts.failed }));
	if (counts.conflict > 0) parts.push(t("save.skippedRename", { n: counts.conflict }));
	return parts.join(", ");
}

/** Notice body after a save. */
export function saveSummary(parts: { renames: string; removed: Removal[]; referenced: string[]; options?: string }): string {
	const lines: string[] = [];
	if (parts.renames) lines.push(parts.renames);
	if (parts.options) lines.push(parts.options);
	for (const r of parts.removed) lines.push(tn("save.removed", r.removed, { name: r.name }) + (r.failed > 0 ? t("option.failedSuffix", { n: r.failed }) : ""));
	for (const name of parts.referenced) lines.push(t("save.stillReferenced", { name }));
	return lines.join("\n");
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function detectedTypeOf(app: App): (name: string) => string | null {
	return (name) => {
		const mtm = getMetadataTypeManager(app);
		if (!mtm) return null;
		try {
			const type: unknown = mtm.getTypeInfo(name, null).expected.type;
			return typeof type === "string" ? type : null;
		} catch {
			return null;
		}
	};
}

/** Dialog input and handlers for one base; the modal itself stays UI-only. */
/** Other schema bases defining `name`, each with the number of this base's members that are also in it (0 while unknown). */
function otherDefinitions(registry: SchemaRegistry, membership: Pick<Membership, "targetEntries">, basePath: string, name: string): OtherDefinition[] {
	const key = name.toLowerCase();
	const mine = new Set((membership.targetEntries(basePath) ?? []).map((f) => f.path));
	const out: OtherDefinition[] = [];
	for (const schema of registry.schemas()) {
		if (schema.basePath === basePath) continue;
		const f = schema.fields.get(key);
		if (!f) continue;
		const theirs = membership.targetEntries(schema.basePath) ?? [];
		out.push({ basePath: schema.basePath, field: f.field, shared: theirs.filter((t) => mine.has(t.path)).length });
	}
	return out;
}

/** Property names of the notes and their values by lower-cased key, so the hints need no rescan per keystroke. */
function readMembers(app: App, files: readonly TFile[]): { keys: string[]; values: Map<string, unknown[]> } {
	const names = new Set<string>();
	const values = new Map<string, unknown[]>();
	for (const f of files) {
		for (const [k, v] of Object.entries(app.metadataCache.getFileCache(f)?.frontmatter ?? {})) {
			if (k === "position") continue;
			names.add(k);
			const key = k.toLowerCase();
			values.set(key, [...(values.get(key) ?? []), v]);
		}
	}
	return { keys: [...names].sort(), values };
}

export async function buildSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry, basePath: string, viewName: string | null, focus?: SchemaSettingsInput["focus"]): Promise<{ input: SchemaSettingsInput; handlers: SchemaSettingsHandlers }> {
	const app = plugin.app;
	const file = app.vault.getAbstractFileByPath(basePath);
	if (!(file instanceof TFile)) throw new Error("Base not found");
	const source = await app.vault.cachedRead(file);
	// Membership watches schema bases only. For a base getting its first schema the notes are read once, in the
	// background, so the dialog opens at once; that read is never cut short, the larger the base the more its suggestions matter.
	const watched = env.membership.targetEntries(basePath);
	let queried: TFile[] | null = null;
	// The read wins over Membership, whose first result right after Save may still be partial.
	const currentMembers = (): TFile[] | null => queried ?? env.membership.targetEntries(basePath);
	const read = readMembers(app, watched ?? []);
	let values = read.values;
	const basePaths = app.vault.getFiles().filter((f) => f.extension === "base").map((f) => f.path).sort();
	let state: State;
	let views: string[] = [];
	let defaultViewIndex = 0;
	let expressions: string[] = [];
	let columns: BaseColumns | null = null;
	try {
		columns = readBaseColumns(source);
		views = columns.views;
		expressions = columns.expressions;
		const index = viewName === null ? -1 : views.indexOf(viewName);
		defaultViewIndex = index < 0 ? 0 : index;
		state = schemaState(registry, basePath, columns, read.keys, detectedTypeOf(app), defaultViewIndex);
	} catch (e) {
		state = { kind: "error", message: message(e), resettable: false };
	}
	const namesOf = (drafts: FieldDraft[]): string[] => drafts.flatMap((d) => (d.originalName === null ? [] : [d.originalName]));
	let originalNames = state.kind === "fields" ? namesOf(state.drafts) : [];
	const fieldsWith = (files: TFile[]): FieldDraft[] | null => {
		queried = files;
		const r = readMembers(app, files);
		values = r.values;
		if (state.kind !== "fields" || columns === null) return [];
		const next = schemaState(registry, basePath, columns, r.keys, detectedTypeOf(app), defaultViewIndex);
		if (next.kind !== "fields") return [];
		originalNames = [...new Set([...originalNames, ...namesOf(next.drafts)])];
		return next.drafts;
	};
	const members = watched !== null ? null : firstResult(env.query, { base: basePath }).then((files) => (files === null ? null : fieldsWith(files)));
	const input: SchemaSettingsInput = {
		basePath,
		state,
		icon: env.membership.baseIcon(basePath) ?? "",
		baseIcon: (path) => env.membership.baseIcon(path),
		basePaths,
		viewNames: (path) => baseViewNames(app, path),
		overlays: env.overlays,
		membersKnown: () => currentMembers() !== null,
		members,
		otherDefinitions: (name) => otherDefinitions(registry, env.membership, basePath, name),
		memberValues: (name) => values.get(name.toLowerCase()) ?? [],
		types: listPropertyTypes(getMetadataTypeManager(app)),
		views,
		defaultViewIndex,
		expressions,
		...(focus ? { focus } : {}),
	};
	const onSave = async (drafts: FieldDraft[], addView: number, icon: string): Promise<void> => {
		const { edits, mutate } = draftsToEdits(drafts, originalNames, addView);
		await env.writer.update(basePath, mutate, edits, icon);
		const pairs = renames(drafts);
		const removedNames = removals(drafts);
		const options = optionMigrations(drafts);
		if (!pairs.length && !removedNames.length && !options.length) {
			new Notice(t("save.done"));
			return;
		}
		const current = currentMembers();
		const conflicts: RenameConflicts = new Map();
		let renameText = renameSummary(pairs, current && pairs.length ? await migrateRenames(app, current, pairs, conflicts) : null);
		const removed = current && removedNames.length ? await removeProperties(app, current, removedNames) : [];
		if (!current && removedNames.length) renameText = [renameText, t("save.notRemoved")].filter(Boolean).join("\n");
		const optionText = options.length ? optionSummary(current ? await migrateOptions(app, current, options, pairs, conflicts) : null) : "";
		const referenced = [...pairs.map((p) => p.from), ...removedNames].filter((n) => referencesName(expressions, n));
		new Notice(`${t("save.done")}\n${saveSummary({ renames: renameText, removed, referenced, options: optionText })}`);
	};
	const onReset = (): Promise<void> => env.writer.reset(basePath);
	const countAffected = async (name: string): Promise<number> => {
		const current = currentMembers();
		return current ? countNotesWithKey(app, current, name) : 0;
	};
	return { input, handlers: { onSave, onReset, countAffected } };
}

/** The dropdown choice for a type id: plugin types map to themselves, any other id is a native override. */
function choiceOf(type: string): TypeChoice {
	return type === "select" || type === "relation" ? type : `native:${type}`;
}

export function registerSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): { open: (basePath: string, viewName: string | null, focus?: { name: string; type: string }) => Promise<void> } {
	let modal: SchemaSettingsModal | null = null;
	// An open dialog belongs to this plugin instance; a reload must not leave it behind with stale handlers.
	plugin.register(() => modal?.close());
	const open = async (basePath: string, viewName: string | null, focus?: { name: string; type: string }): Promise<void> => {
		try {
			const { input, handlers } = await buildSchemaSettings(plugin, env, registry, basePath, viewName, focus && { name: focus.name, type: choiceOf(focus.type) });
			modal?.close();
			modal = new SchemaSettingsModal(plugin.app, input, handlers);
			modal.open();
		} catch (e) {
			new Notice(t("notice.openFailed", { error: message(e) }));
		}
	};
	plugin.addCommand({
		id: "open-schema-settings",
		name: t("command.openSchemaSettings"),
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!(file instanceof TFile) || file.extension !== "base") return false;
			if (!checking) void open(file.path, null);
			return true;
		},
	});
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file, source) => {
			if (!["tab-header", "more-options", "file-explorer-context-menu"].includes(source)) return;
			if (!(file instanceof TFile) || file.extension !== "base") return;
			menu.addItem((item) => item.setSection("action").setTitle(t("menu.schemaSettings")).setIcon("lucide-shapes").onClick(() => void open(file.path, null)));
		}),
	);
	plugin.register(installSchemaButton(plugin.app, (path, view) => void open(path, view)));
	return { open };
}
