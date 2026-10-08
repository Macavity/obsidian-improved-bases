import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, ImprovedBasesSettings, ImprovedBasesSettingTab } from "./settings";

export default class ImprovedBasesPlugin extends Plugin {
	settings: ImprovedBasesSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ImprovedBasesSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ImprovedBasesSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
