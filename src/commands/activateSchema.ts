import { Notice, TFile, type Plugin } from "obsidian";
import type { SchemaRegistry } from "../schema/SchemaRegistry";
import type { SchemaWriter } from "../schema/SchemaWriter";

/** True when the registry is loaded and knows nothing about this base yet. */
export function canActivate(registry: { loaded: boolean; schemas(): { basePath: string }[]; errors(): Map<string, unknown> }, path: string): boolean {
	if (!registry.loaded) return false;
	return !(registry.schemas().some((s) => s.basePath === path) || registry.errors().has(path));
}

/** Command: write an empty `improved-bases:` node into the active `.base`. */
export function registerActivateSchema(plugin: Plugin, writer: SchemaWriter, registry: SchemaRegistry): void {
	plugin.addCommand({
		id: "activate-schema-base",
		name: "Activate as schema base",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!(file instanceof TFile) || file.extension !== "base") return false;
			if (!canActivate(registry, file.path)) return false;
			if (!checking) {
				writer.activate(file.path).then(
					() => new Notice(`${file.basename} is now a schema base`),
					(e: unknown) => new Notice(`Could not activate: ${e instanceof Error ? e.message : String(e)}`),
				);
			}
			return true;
		},
	});
}
