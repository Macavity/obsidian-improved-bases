import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import ImprovedBasesPlugin from "./main";

export interface ImprovedBasesSettings {
	widgetsEnabled: boolean;
	importFolder: string;
}

export const DEFAULT_SETTINGS: ImprovedBasesSettings = { widgetsEnabled: true, importFolder: "Optionen" };

/** Defensive merge: unknown keys and wrongly typed values fall back to the defaults. */
export function mergeSettings(raw: unknown): ImprovedBasesSettings {
	const merged = { ...DEFAULT_SETTINGS };
	if (typeof raw !== "object" || raw === null) return merged;
	const { widgetsEnabled, importFolder } = raw as Record<string, unknown>;
	if (typeof widgetsEnabled === "boolean") merged.widgetsEnabled = widgetsEnabled;
	if (typeof importFolder === "string") merged.importFolder = importFolder;
	return merged;
}

export class ImprovedBasesSettingTab extends PluginSettingTab {
	plugin: ImprovedBasesPlugin;

	constructor(app: App, plugin: ImprovedBasesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings API (Obsidian 1.13 and later). Obsidian renders these
	 * definitions itself and indexes them for the built-in settings search.
	 * `key` is the property name on `this.plugin.settings`.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const plugin = this.plugin;
		return [
			{
				name: "Enable widgets",
				desc: (plugin.widgetsSupported
					? "Show relation and select widgets in tables and the properties panel."
					: "This Obsidian version is not supported; widgets are unavailable. Commands still work."),
				control: { type: "toggle", key: "widgetsEnabled", defaultValue: true, disabled: () => !plugin.widgetsSupported },
			},
			{
				name: "Import folder",
				desc: "Folder with option notes used by the import command.",
				control: { type: "text", key: "importFolder", defaultValue: DEFAULT_SETTINGS.importFolder, placeholder: DEFAULT_SETTINGS.importFolder },
			},
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		settings[key] = value;
		await this.plugin.saveSettings();
		if (key === "widgetsEnabled") this.plugin.applyWidgetsEnabled();
	}
}
