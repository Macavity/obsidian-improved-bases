import { getFrontMatterInfo, Notice, parseYaml, TFile, type App, type Plugin } from "obsidian";
import { installSchemaButton } from "../internals/toolbar";
import { firstResult } from "../query/BaseQuery";
import type { SchemaRegistry } from "../schema/SchemaRegistry";
import type { WidgetEnv } from "../widgets/types";
import { SchemaSettingsModal, type SchemaSettingsHandlers, type SchemaSettingsInput } from "./SchemaSettingsModal";
import { draftsToEdits, knownFieldDrafts, optionMigrations, removals, renameKey, renames, type FieldDraft, type OptionMigration, type OtherDefinition } from "./schemaDraft";
import { migrateOptionValues, optionValueEdit } from "../schema/optionMigration";
import type { Membership } from "../schema/Membership";
import { readBaseColumns, referencesName, type BaseColumns } from "../schema/baseDoc";
import { getMetadataTypeManager } from "../internals/detect";
import { listPropertyTypes } from "../internals/typeRegistry";
import { findOwnKey } from "../schema/keys";

type Pairs = { from: string; to: string }[];
type Counts = { renamed: number; conflict: number; failed: number };

type State = SchemaSettingsInput["state"];

/** A member query that takes longer than this gets a Notice, so a large base does not look stuck. */
const SLOW_QUERY_MS = 500;

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
	if (counts === null) return "Properties not renamed: base members unknown";
	const label = pairs.map((p) => `${p.from} → ${p.to}`).join(", ");
	const parts = [`Renamed ${label} in ${counts.renamed} ${counts.renamed === 1 ? "note" : "notes"}`];
	if (counts.conflict > 0) parts.push(`${counts.conflict} skipped (both keys present)`);
	if (counts.failed > 0) parts.push(`${counts.failed} failed`);
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

const notes = (n: number): string => `${n} ${n === 1 ? "note" : "notes"}`;

/** Notice line for option migrations; `counts` is null when the base members were unknown. */
export function optionSummary(counts: OptionCounts | null): string {
	if (counts === null) return "Option values not migrated: base members unknown";
	const parts = [`Option values updated in ${notes(counts.changed)}`];
	if (counts.failed > 0) parts.push(`${counts.failed} failed`);
	if (counts.conflict > 0) parts.push(`${counts.conflict} skipped (field rename conflict)`);
	return parts.join(", ");
}

/** Notice body after a save. */
export function saveSummary(parts: { renames: string; removed: Removal[]; referenced: string[]; options?: string }): string {
	const lines: string[] = [];
	if (parts.renames) lines.push(parts.renames);
	if (parts.options) lines.push(parts.options);
	for (const r of parts.removed) lines.push(`Removed '${r.name}' from ${r.removed} ${r.removed === 1 ? "note" : "notes"}${r.failed > 0 ? `, ${r.failed} failed` : ""}`);
	for (const name of parts.referenced) lines.push(`Filters or formulas still reference '${name}', update them manually`);
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

/**
 * Reads the base's members: a single query taken when the dialog opens, else Membership's live result.
 * Membership watches schema bases only, so a base getting its first schema would otherwise show no notes.
 * The snapshot wins over Membership, whose first result after Save may still be partial.
 * The query is never cut short: the larger the base, the more its suggestions matter.
 */
async function memberSource(env: WidgetEnv, basePath: string): Promise<() => TFile[] | null> {
	if (env.membership.targetEntries(basePath) !== null) return () => env.membership.targetEntries(basePath);
	const name = basePath.split("/").pop()?.replace(/\.base$/, "") ?? basePath;
	let notice: Notice | null = null;
	const timer = window.setTimeout(() => (notice = new Notice(`Reading the notes of ${name}…`, 0)), SLOW_QUERY_MS);
	try {
		const queried = await firstResult(env.query, basePath);
		return () => queried ?? env.membership.targetEntries(basePath);
	} finally {
		window.clearTimeout(timer);
		(notice as Notice | null)?.hide();
	}
}

export async function buildSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry, basePath: string, viewName: string | null): Promise<{ input: SchemaSettingsInput; handlers: SchemaSettingsHandlers }> {
	const app = plugin.app;
	const file = app.vault.getAbstractFileByPath(basePath);
	if (!(file instanceof TFile)) throw new Error("Base not found");
	const source = await app.vault.cachedRead(file);
	const currentMembers = await memberSource(env, basePath);
	const members = currentMembers();
	const names = new Set<string>();
	// Lower-cased key to the member values, so the mismatch hint needs no rescan per keystroke.
	const values = new Map<string, unknown[]>();
	for (const f of members ?? []) {
		for (const [k, v] of Object.entries(app.metadataCache.getFileCache(f)?.frontmatter ?? {})) {
			if (k === "position") continue;
			names.add(k);
			const key = k.toLowerCase();
			values.set(key, [...(values.get(key) ?? []), v]);
		}
	}
	const memberKeys = [...names].sort();
	const basePaths = app.vault.getFiles().filter((f) => f.extension === "base").map((f) => f.path).sort();
	let state: State;
	let views: string[] = [];
	let defaultViewIndex = 0;
	let expressions: string[] = [];
	try {
		const columns = readBaseColumns(source);
		views = columns.views;
		expressions = columns.expressions;
		const index = viewName === null ? -1 : views.indexOf(viewName);
		defaultViewIndex = index < 0 ? 0 : index;
		state = schemaState(registry, basePath, columns, memberKeys, detectedTypeOf(app), defaultViewIndex);
	} catch (e) {
		state = { kind: "error", message: message(e), resettable: false };
	}
	const originalNames = state.kind === "fields" ? state.drafts.flatMap((d) => (d.originalName === null ? [] : [d.originalName])) : [];
	const input: SchemaSettingsInput = {
		basePath,
		state,
		icon: env.membership.baseIcon(basePath) ?? "",
		baseIcon: (path) => env.membership.baseIcon(path),
		basePaths,
		overlays: env.overlays,
		membersKnown: () => currentMembers() !== null,
		otherDefinitions: (name) => otherDefinitions(registry, env.membership, basePath, name),
		memberValues: (name) => values.get(name.toLowerCase()) ?? [],
		types: listPropertyTypes(getMetadataTypeManager(app)),
		views,
		defaultViewIndex,
		expressions,
	};
	const onSave = async (drafts: FieldDraft[], addView: number, icon: string): Promise<void> => {
		const { edits, mutate } = draftsToEdits(drafts, originalNames, addView);
		await env.writer.update(basePath, mutate, edits, icon);
		const pairs = renames(drafts);
		const removedNames = removals(drafts);
		const options = optionMigrations(drafts);
		if (!pairs.length && !removedNames.length && !options.length) {
			new Notice("Schema saved");
			return;
		}
		const current = currentMembers();
		const conflicts: RenameConflicts = new Map();
		let renameText = renameSummary(pairs, current && pairs.length ? await migrateRenames(app, current, pairs, conflicts) : null);
		const removed = current && removedNames.length ? await removeProperties(app, current, removedNames) : [];
		if (!current && removedNames.length) renameText = [renameText, "Properties not removed: base members unknown"].filter(Boolean).join("\n");
		const optionText = options.length ? optionSummary(current ? await migrateOptions(app, current, options, pairs, conflicts) : null) : "";
		const referenced = [...pairs.map((p) => p.from), ...removedNames].filter((n) => referencesName(expressions, n));
		new Notice(`Schema saved\n${saveSummary({ renames: renameText, removed, referenced, options: optionText })}`);
	};
	const onReset = (): Promise<void> => env.writer.reset(basePath);
	const countAffected = async (name: string): Promise<number> => {
		const current = currentMembers();
		return current ? countNotesWithKey(app, current, name) : 0;
	};
	return { input, handlers: { onSave, onReset, countAffected } };
}

export function registerSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): void {
	let modal: SchemaSettingsModal | null = null;
	// An open dialog belongs to this plugin instance; a reload must not leave it behind with stale handlers.
	plugin.register(() => modal?.close());
	// Reading a large base's notes takes a while; a second click meanwhile must not open a second dialog.
	let opening = false;
	const open = async (basePath: string, viewName: string | null): Promise<void> => {
		if (opening) return;
		opening = true;
		try {
			const { input, handlers } = await buildSchemaSettings(plugin, env, registry, basePath, viewName);
			modal?.close();
			modal = new SchemaSettingsModal(plugin.app, input, handlers);
			modal.open();
		} catch (e) {
			new Notice(`Could not open schema settings: ${message(e)}`);
		} finally {
			opening = false;
		}
	};
	plugin.addCommand({
		id: "open-schema-settings",
		name: "Open schema settings",
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
			menu.addItem((item) => item.setSection("action").setTitle("Schema settings").setIcon("lucide-shapes").onClick(() => void open(file.path, null)));
		}),
	);
	plugin.register(installSchemaButton(plugin.app, (path, view) => void open(path, view)));
}
