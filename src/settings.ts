import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import ImprovedBasesPlugin from "./main";

// No settings yet; turn into an interface once the first one lands.
export type ImprovedBasesSettings = Record<string, never>;

export const DEFAULT_SETTINGS: ImprovedBasesSettings = {};

export class ImprovedBasesSettingTab extends PluginSettingTab {
	plugin: ImprovedBasesPlugin;

	constructor(app: App, plugin: ImprovedBasesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings API (Obsidian 1.13 and later). Obsidian renders these
	 * definitions itself and indexes them for the built-in settings search.
	 * `key` is the property name on `this.plugin.settings`; the default
	 * getControlValue/setControlValue implementations persist changes.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [];
	}

	/**
	 * Fallback for Obsidian versions before 1.13, which do not call
	 * getSettingDefinitions(). Keep it in sync with the definitions above, or
	 * drop it once minAppVersion is 1.13.0 or later.
	 */
	display(): void {
		this.containerEl.empty();
	}
}
