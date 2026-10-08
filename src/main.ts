import { Notice, Plugin } from "obsidian";
import { installTypeInfoPatch, TypeInfoPatch } from "./internals/typeInfoPatch";
import { BaseQuery, createBaseQuery } from "./query/BaseQuery";
import { Membership } from "./schema/Membership";
import { SchemaRegistry } from "./schema/SchemaRegistry";
import { SchemaWriter } from "./schema/SchemaWriter";
import { OverlayRegistry } from "./widgets/types";
import { RelationWidget } from "./widgets/RelationWidget";
import { SelectWidget } from "./widgets/SelectWidget";
import { registerActivateSchema } from "./commands/activateSchema";
import { registerConfigureField } from "./commands/configureField";
import { DEFAULT_SETTINGS, ImprovedBasesSettings, ImprovedBasesSettingTab } from "./settings";

export default class ImprovedBasesPlugin extends Plugin {
	settings: ImprovedBasesSettings;
	query: BaseQuery;
	registry: SchemaRegistry;
	membership: Membership;
	writer: SchemaWriter;
	typeInfoPatch: TypeInfoPatch | null = null;

	async onload() {
		await this.loadSettings();
		this.query = createBaseQuery(this);
		this.register(() => this.query.dispose());
		this.registry = new SchemaRegistry(this.app);
		this.membership = new Membership(this.registry, this.query, { cache: this.app.metadataCache });
		this.register(() => {
			this.membership.dispose();
			this.registry.dispose();
		});
		this.writer = new SchemaWriter(this.app);
		const env = { membership: this.membership, writer: this.writer, app: this.app, overlays: new OverlayRegistry() };
		this.typeInfoPatch = installTypeInfoPatch(this.app, env, { relation: RelationWidget, select: SelectWidget });
		if (this.typeInfoPatch) {
			const patch = this.typeInfoPatch;
			this.register(() => patch.uninstall());
		} else {
			new Notice(`${this.manifest.name}: this Obsidian version is not supported`);
		}
		registerActivateSchema(this, this.writer, this.registry);
		registerConfigureField(this, env, this.registry);
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
