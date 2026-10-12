import { getFrontMatterInfo, Notice, parseYaml, TFile, type App, type Plugin } from "obsidian";
import { installSchemaButton } from "../internals/toolbar";
import type { SchemaRegistry } from "../schema/SchemaRegistry";
import type { WidgetEnv } from "../widgets/types";
import { SchemaSettingsModal, type SchemaSettingsHandlers, type SchemaSettingsInput } from "./SchemaSettingsModal";
import { draftsToEdits, knownFieldDrafts, removals, renameKey, renames, type FieldDraft, type OtherDefinition } from "./schemaDraft";
import type { Membership } from "../schema/Membership";
import { readBaseColumns, referencesName, type BaseColumns } from "../schema/baseDoc";
import { getMetadataTypeManager } from "../internals/detect";
import { findOwnKey } from "../schema/keys";

type Pairs = { from: string; to: string }[];
type Counts = { renamed: number; conflict: number; failed: number };

type State = SchemaSettingsInput["state"];

/** Modal state for a base: its known fields, or the schema errors. */
export function schemaState(registry: SchemaRegistry, basePath: string, columns: BaseColumns, memberKeys: string[], nativeLabel: (name: string) => string | null, currentView: number): State {
	const errors = registry.errors().get(basePath);
	if (errors) return { kind: "error", message: errors.join("; "), resettable: true };
	const schemaFields = registry.schemas().find((s) => s.basePath === basePath)?.fields ?? null;
	return { kind: "fields", drafts: knownFieldDrafts({ columns, schemaFields, memberKeys, nativeLabel, currentView }) };
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

/** Renames frontmatter keys (exact spelling) in one note; null when the note has none of them. */
async function renameInNote(app: App, file: TFile, pairs: Pairs): Promise<{ renamed: boolean; conflict: boolean } | null> {
	const present = await namesPresent(app, file, pairs.map((p) => p.from), exactKey);
	if (!present.length) return null;
	const outcome = { renamed: false, conflict: false };
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		for (const { from, to } of pairs) {
			const result = renameKey(fm, from, to);
			if (result === "renamed") outcome.renamed = true;
			else if (result === "conflict") outcome.conflict = true;
		}
	});
	return outcome;
}

/** Renames frontmatter keys in the notes that have one of them, one file at a time; counts are per note. Unreadable notes count as failed. */
export async function migrateRenames(app: App, files: TFile[], pairs: Pairs): Promise<Counts> {
	const counts: Counts = { renamed: 0, conflict: 0, failed: 0 };
	for (const file of files) {
		try {
			const outcome = await renameInNote(app, file, pairs);
			if (outcome?.renamed) counts.renamed++;
			if (outcome?.conflict) counts.conflict++;
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

/** Notice body after a save. */
export function saveSummary(parts: { renames: string; removed: Removal[]; referenced: string[] }): string {
	const lines: string[] = [];
	if (parts.renames) lines.push(parts.renames);
	for (const r of parts.removed) lines.push(`Removed '${r.name}' from ${r.removed} ${r.removed === 1 ? "note" : "notes"}${r.failed > 0 ? `, ${r.failed} failed` : ""}`);
	for (const name of parts.referenced) lines.push(`Filters or formulas still reference '${name}', update them manually`);
	return lines.join("\n");
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function nativeLabelOf(app: App): (name: string) => string | null {
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

export async function buildSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry, basePath: string, viewName: string | null): Promise<{ input: SchemaSettingsInput; handlers: SchemaSettingsHandlers }> {
	const app = plugin.app;
	const file = app.vault.getAbstractFileByPath(basePath);
	if (!(file instanceof TFile)) throw new Error("Base not found");
	const source = await app.vault.cachedRead(file);
	const members = env.membership.targetEntries(basePath);
	const names = new Set<string>();
	for (const f of members ?? []) {
		for (const k of Object.keys(app.metadataCache.getFileCache(f)?.frontmatter ?? {})) {
			if (k !== "position") names.add(k);
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
		state = schemaState(registry, basePath, columns, memberKeys, nativeLabelOf(app), defaultViewIndex);
	} catch (e) {
		state = { kind: "error", message: message(e), resettable: false };
	}
	const originalNames = state.kind === "fields" ? state.drafts.flatMap((d) => (d.originalName === null ? [] : [d.originalName])) : [];
	const input: SchemaSettingsInput = {
		basePath,
		state,
		icon: env.membership.baseIcon(basePath) ?? "",
		basePaths,
		overlays: env.overlays,
		membersKnown: () => env.membership.targetEntries(basePath) !== null,
		otherDefinitions: (name) => otherDefinitions(registry, env.membership, basePath, name),
		views,
		defaultViewIndex,
		expressions,
	};
	const onSave = async (drafts: FieldDraft[], addView: number, icon: string): Promise<void> => {
		const { edits, mutate } = draftsToEdits(drafts, originalNames, addView);
		await env.writer.update(basePath, mutate, edits, icon);
		const pairs = renames(drafts);
		const removedNames = removals(drafts);
		if (!pairs.length && !removedNames.length) {
			new Notice("Schema saved");
			return;
		}
		const current = env.membership.targetEntries(basePath);
		let renameText = renameSummary(pairs, current && pairs.length ? await migrateRenames(app, current, pairs) : null);
		const removed = current && removedNames.length ? await removeProperties(app, current, removedNames) : [];
		if (!current && removedNames.length) renameText = [renameText, "Properties not removed: base members unknown"].filter(Boolean).join("\n");
		const referenced = [...pairs.map((p) => p.from), ...removedNames].filter((n) => referencesName(expressions, n));
		new Notice(`Schema saved\n${saveSummary({ renames: renameText, removed, referenced })}`);
	};
	const onReset = (): Promise<void> => env.writer.reset(basePath);
	const countAffected = async (name: string): Promise<number> => {
		const current = env.membership.targetEntries(basePath);
		return current ? countNotesWithKey(app, current, name) : 0;
	};
	return { input, handlers: { onSave, onReset, countAffected } };
}

export function registerSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): void {
	const open = async (basePath: string, viewName: string | null): Promise<void> => {
		try {
			const { input, handlers } = await buildSchemaSettings(plugin, env, registry, basePath, viewName);
			new SchemaSettingsModal(plugin.app, input, handlers).open();
		} catch (e) {
			new Notice(`Could not open schema settings: ${message(e)}`);
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
