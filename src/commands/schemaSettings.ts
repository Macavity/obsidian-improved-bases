import { getFrontMatterInfo, Notice, parseYaml, TFile, type App, type Plugin } from "obsidian";
import { installSchemaButton } from "../internals/toolbar";
import type { SchemaRegistry } from "../schema/SchemaRegistry";
import type { WidgetEnv } from "../widgets/types";
import { SchemaSettingsModal, type SchemaSettingsHandlers, type SchemaSettingsInput } from "./SchemaSettingsModal";
import { draftsToEdits, knownFieldDrafts, removals, renameKey, renames, type FieldDraft } from "./schemaDraft";
import { readBaseColumns, referencesName, type BaseColumns } from "../schema/baseDoc";
import { getMetadataTypeManager } from "../internals/detect";

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

/**
 * Whether the note's frontmatter on disk has one of the keys; `processFrontMatter` rewrites a note even
 * when nothing changes, so only notes that need it are passed on. Unparseable frontmatter counts as
 * "maybe" and is left to `processFrontMatter`, which then reports the failure.
 */
async function hasAnyKey(app: App, file: TFile, keys: string[]): Promise<boolean> {
	const info = getFrontMatterInfo(await app.vault.cachedRead(file));
	if (!info.exists) return false;
	try {
		const fm: unknown = parseYaml(info.frontmatter);
		return typeof fm === "object" && fm !== null && keys.some((k) => Object.hasOwn(fm, k));
	} catch {
		return true;
	}
}

/** Renames frontmatter keys in the notes that have one of them, one file at a time; counts are per note. */
export async function migrateRenames(app: App, files: TFile[], pairs: Pairs): Promise<Counts> {
	const counts: Counts = { renamed: 0, conflict: 0, failed: 0 };
	const keys = pairs.map((p) => p.from);
	for (const file of files) {
		if (!(await hasAnyKey(app, file, keys))) continue;
		let renamed = false;
		let conflict = false;
		try {
			await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				for (const { from, to } of pairs) {
					const result = renameKey(fm, from, to);
					if (result === "renamed") renamed = true;
					else if (result === "conflict") conflict = true;
				}
			});
			if (renamed) counts.renamed++;
			if (conflict) counts.conflict++;
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

/** Deletes the keys from the notes that have one of them; counts are per note. */
export async function removeProperties(app: App, files: TFile[], names: string[]): Promise<{ removed: number; failed: number }> {
	const result = { removed: 0, failed: 0 };
	for (const file of files) {
		if (!(await hasAnyKey(app, file, names))) continue;
		try {
			await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				for (const name of names) if (Object.hasOwn(fm, name)) delete fm[name];
			});
			result.removed++;
		} catch (e) {
			console.error(`Improved Bases: removing properties from ${file.path} failed`, e);
			result.failed++;
		}
	}
	return result;
}

/** Number of notes whose frontmatter on disk has the key. */
export async function countNotesWithKey(app: App, files: TFile[], name: string): Promise<number> {
	let count = 0;
	for (const file of files) if (await hasAnyKey(app, file, [name])) count++;
	return count;
}

/** Notice body after a save. */
export function saveSummary(parts: { renames: string; removed: { name: string; removed: number; failed: number }[]; referenced: string[] }): string {
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
		propertyNames: memberKeys,
		basePaths,
		overlays: env.overlays,
		membersKnown: () => env.membership.targetEntries(basePath) !== null,
		views,
		defaultViewIndex,
		expressions,
	};
	const onSave = async (drafts: FieldDraft[], addView: number): Promise<void> => {
		const { edits, mutate } = draftsToEdits(drafts, originalNames, addView);
		await env.writer.update(basePath, mutate, edits);
		const pairs = renames(drafts);
		const removedNames = removals(drafts);
		if (!pairs.length && !removedNames.length) {
			new Notice("Schema saved");
			return;
		}
		const current = env.membership.targetEntries(basePath);
		let renameText = renameSummary(pairs, current && pairs.length ? await migrateRenames(app, current, pairs) : null);
		const removed: { name: string; removed: number; failed: number }[] = [];
		if (removedNames.length) {
			if (current) {
				for (const name of removedNames) removed.push({ name, ...(await removeProperties(app, current, [name])) });
			} else {
				renameText = [renameText, "Properties not removed: base members unknown"].filter(Boolean).join("\n");
			}
		}
		const referenced = pairs.filter((p) => referencesName(expressions, p.from)).map((p) => p.from);
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
