import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type ImprovedBasesPlugin from "./main";
import { t, tn } from "./i18n";

export interface ImprovedBasesSettings {
	/** Icon of a relation entry whose note and base have none. */
	defaultEntryIcon: string;
	/** The "Schema" button in every Bases toolbar. */
	showToolbarButton: boolean;
	/** The info marker on a field several schema bases define; the console warning stays either way. */
	showConflictMarkers: boolean;
}

export const DEFAULT_SETTINGS: ImprovedBasesSettings = { defaultEntryIcon: "📄", showToolbarButton: true, showConflictMarkers: true };

/** Defensive merge: unknown keys (such as the removed `widgetsEnabled`) and wrongly typed values fall back to the defaults. */
export function mergeSettings(raw: unknown): ImprovedBasesSettings {
	const merged = { ...DEFAULT_SETTINGS };
	if (typeof raw !== "object" || raw === null) return merged;
	const { defaultEntryIcon, showToolbarButton, showConflictMarkers } = raw as Record<string, unknown>;
	if (typeof defaultEntryIcon === "string" && defaultEntryIcon.trim() !== "") merged.defaultEntryIcon = defaultEntryIcon.trim();
	if (typeof showToolbarButton === "boolean") merged.showToolbarButton = showToolbarButton;
	if (typeof showConflictMarkers === "boolean") merged.showConflictMarkers = showConflictMarkers;
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
		return [
			{
				name: t("settings.defaultIcon.name"),
				desc: t("settings.defaultIcon.desc"),
				control: { type: "text", key: "defaultEntryIcon", defaultValue: DEFAULT_SETTINGS.defaultEntryIcon, placeholder: DEFAULT_SETTINGS.defaultEntryIcon },
			},
			{
				name: t("settings.toolbar.name"),
				desc: t("settings.toolbar.desc"),
				control: { type: "toggle", key: "showToolbarButton", defaultValue: true },
			},
			{
				name: t("settings.conflictMarkers.name"),
				desc: t("settings.conflictMarkers.desc"),
				control: { type: "toggle", key: "showConflictMarkers", defaultValue: true },
			},
			{
				name: t("settings.warnings.name"),
				desc: t("settings.warnings.desc"),
				render: (setting) => this.renderWarnings(setting),
			},
		];
	}

	/** "n current warnings" with a button opening the list; the count follows the registry while the row is shown. */
	renderWarnings(setting: Setting): () => void {
		const { warnings } = this.plugin;
		const update = (): void => void setting.setName(tn("settings.warnings.count", warnings.count));
		update();
		setting.addButton((b) => b.setButtonText(t("settings.warnings.show")).onClick(() => this.plugin.showWarnings()));
		const ref = warnings.on("changed", update);
		return () => warnings.offref(ref);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		this.plugin.settings = mergeSettings({ ...this.plugin.settings, [key]: value });
		await this.plugin.saveSettings();
		this.plugin.applySettings();
	}
}
