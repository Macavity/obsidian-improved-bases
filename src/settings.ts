import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type ImprovedBasesPlugin from "./main";

export interface ImprovedBasesSettings {
	widgetsEnabled: boolean;
}

export const DEFAULT_SETTINGS: ImprovedBasesSettings = { widgetsEnabled: true };

/** Defensive merge: unknown keys and wrongly typed values fall back to the defaults. */
export function mergeSettings(raw: unknown): ImprovedBasesSettings {
	const merged = { ...DEFAULT_SETTINGS };
	if (typeof raw !== "object" || raw === null) return merged;
	const { widgetsEnabled } = raw as Record<string, unknown>;
	if (typeof widgetsEnabled === "boolean") merged.widgetsEnabled = widgetsEnabled;
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
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		this.plugin.settings = mergeSettings({ ...this.plugin.settings, [key]: value });
		await this.plugin.saveSettings();
		if (key === "widgetsEnabled") this.plugin.applyWidgetsEnabled();
	}
}
