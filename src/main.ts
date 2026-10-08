import { Plugin } from "obsidian";
import { BaseQuery, createBaseQuery } from "./query/BaseQuery";
import { Membership } from "./schema/Membership";
import { SchemaRegistry } from "./schema/SchemaRegistry";
import { DEFAULT_SETTINGS, ImprovedBasesSettings, ImprovedBasesSettingTab } from "./settings";

export default class ImprovedBasesPlugin extends Plugin {
	settings: ImprovedBasesSettings;
	query: BaseQuery;
	registry: SchemaRegistry;
	membership: Membership;

	async onload() {
		await this.loadSettings();
		this.query = createBaseQuery(this);
		this.register(() => this.query.dispose());
		this.registry = new SchemaRegistry(this.app);
		this.membership = new Membership(this.registry, this.query);
		this.register(() => {
			this.membership.dispose();
			this.registry.dispose();
		});
		this.app.workspace.onLayoutReady(() => void this.registry.load());
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
