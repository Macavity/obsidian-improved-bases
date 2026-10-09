import { Notice, TFile, type App, type Plugin } from "obsidian";
import { installSchemaButton } from "../internals/toolbar";
import type { SchemaRegistry } from "../schema/SchemaRegistry";
import type { WidgetEnv } from "../widgets/types";
import { SchemaSettingsModal, type SchemaSettingsInput } from "./SchemaSettingsModal";
import { draftsToMutation, fieldsToDrafts, renameKey, renames, type FieldDraft } from "./schemaDraft";

type Pairs = { from: string; to: string }[];
type Counts = { renamed: number; conflict: number; failed: number };

/** Modal state for a base: its fields, its schema errors, or an empty field list. */
export function schemaState(registry: SchemaRegistry, basePath: string): SchemaSettingsInput["state"] {
	const schema = registry.schemas().find((s) => s.basePath === basePath);
	if (schema) return { kind: "fields", drafts: fieldsToDrafts(schema.fields) };
	const errors = registry.errors().get(basePath);
	if (errors) return { kind: "error", message: errors.join("; ") };
	return { kind: "fields", drafts: [] };
}

/** Renames frontmatter keys in the given notes, one file at a time. */
export async function migrateRenames(app: App, files: TFile[], pairs: Pairs): Promise<Counts> {
	const counts: Counts = { renamed: 0, conflict: 0, failed: 0 };
	for (const file of files) {
		try {
			await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				for (const { from, to } of pairs) {
					const result = renameKey(fm, from, to);
					if (result === "renamed") counts.renamed++;
					else if (result === "conflict") counts.conflict++;
				}
			});
		} catch (e) {
			console.error(`Improved Bases: renaming properties in ${file.path} failed`, e);
			counts.failed++;
		}
	}
	return counts;
}

export function renameSummary(pairs: Pairs, counts: Counts): string {
	if (!pairs.length) return "";
	const label = pairs.map((p) => `${p.from} → ${p.to}`).join(", ");
	const parts = [`Renamed ${label} in ${counts.renamed} ${counts.renamed === 1 ? "note" : "notes"}`];
	if (counts.conflict > 0) parts.push(`${counts.conflict} skipped (both keys present)`);
	if (counts.failed > 0) parts.push(`${counts.failed} failed`);
	return parts.join(", ");
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function openSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry, basePath: string): void {
	const app = plugin.app;
	const members = env.membership.targetEntries(basePath);
	const names = new Set<string>();
	for (const f of members ?? []) {
		for (const k of Object.keys(app.metadataCache.getFileCache(f)?.frontmatter ?? {})) {
			if (k !== "position") names.add(k);
		}
	}
	const basePaths = app.vault.getFiles().filter((f) => f.extension === "base" && f.path !== basePath).map((f) => f.path).sort();
	const state = schemaState(registry, basePath);
	const originalNames = state.kind === "fields" ? state.drafts.flatMap((d) => (d.originalName === null ? [] : [d.originalName])) : [];
	const input: SchemaSettingsInput = {
		basePath,
		state,
		propertyNames: [...names].sort(),
		basePaths,
		overlays: env.overlays,
		canRename: env.membership.ready,
	};
	const onSave = async (drafts: FieldDraft[]): Promise<void> => {
		if (!registry.schemas().some((s) => s.basePath === basePath) && !registry.errors().has(basePath)) {
			await env.writer.activate(basePath);
		}
		await env.writer.update(basePath, draftsToMutation(drafts, originalNames));
		const pairs = renames(drafts);
		if (!pairs.length) {
			new Notice("Schema saved");
			return;
		}
		const counts = await migrateRenames(app, env.membership.targetEntries(basePath) ?? [], pairs);
		new Notice(`Schema saved\n${renameSummary(pairs, counts)}`);
	};
	const onReset = (): Promise<void> => env.writer.reset(basePath);
	new SchemaSettingsModal(app, input, { onSave, onReset }).open();
}

export function registerSchemaSettings(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): void {
	const open = (basePath: string): void => {
		try {
			openSchemaSettings(plugin, env, registry, basePath);
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
			if (!checking) open(file.path);
			return true;
		},
	});
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file, source) => {
			if (!["tab-header", "more-options", "file-explorer-context-menu"].includes(source)) return;
			if (!(file instanceof TFile) || file.extension !== "base") return;
			menu.addItem((item) => item.setSection("action").setTitle("Schema settings").setIcon("lucide-shapes").onClick(() => open(file.path)));
		}),
	);
	plugin.register(installSchemaButton(plugin.app, open));
}
