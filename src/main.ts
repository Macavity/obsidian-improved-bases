import { Notice, Plugin } from "obsidian";
import { installTypeInfoPatch, TypeInfoPatch } from "./internals/typeInfoPatch";
import { BaseQuery, createBaseQuery } from "./query/BaseQuery";
import { Membership } from "./schema/Membership";
import { SchemaRegistry } from "./schema/SchemaRegistry";
import { SchemaWriter } from "./schema/SchemaWriter";
import { OverlayRegistry, WidgetEnv } from "./widgets/types";
import { RelationWidget } from "./widgets/RelationWidget";
import { SelectWidget } from "./widgets/SelectWidget";
import { registerActivateSchema } from "./commands/activateSchema";
import { registerConfigureField } from "./commands/configureField";
import { registerImportOptions } from "./commands/importOptions";
import { getMetadataTypeManager } from "./internals/detect";
import { ImprovedBasesSettings, ImprovedBasesSettingTab, mergeSettings } from "./settings";

export default class ImprovedBasesPlugin extends Plugin {
	settings: ImprovedBasesSettings;
	query: BaseQuery;
	registry: SchemaRegistry;
	membership: Membership;
	writer: SchemaWriter;
	typeInfoPatch: TypeInfoPatch | null = null;
	/** False when Obsidian internals are missing; widgets then stay off, commands keep working. */
	widgetsSupported = true;
	private env: WidgetEnv;
	private notified = false;

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
		this.env = env;
		this.widgetsSupported = getMetadataTypeManager(this.app) !== null;
		if (!this.widgetsSupported) this.notifyUnsupported();
		this.applyWidgetsEnabled();
		this.register(() => {
			this.typeInfoPatch?.uninstall();
			this.typeInfoPatch = null;
		});
		registerActivateSchema(this, this.writer, this.registry);
		registerConfigureField(this, env, this.registry);
		registerImportOptions(this, env, () => this.settings.importFolder);
		this.app.workspace.onLayoutReady(() => void this.registry.load());
		this.addSettingTab(new ImprovedBasesSettingTab(this.app, this));
	}

	private notifyUnsupported() {
		if (this.notified) return;
		this.notified = true;
		new Notice(`${this.manifest.name}: this Obsidian version is not supported`);
	}

	/** Installs or removes the getTypeInfo patch according to `settings.widgetsEnabled`. */
	applyWidgetsEnabled() {
		if (this.settings.widgetsEnabled && this.widgetsSupported) {
			if (this.typeInfoPatch) return;
			this.typeInfoPatch = installTypeInfoPatch(this.app, this.env, { relation: RelationWidget, select: SelectWidget });
			if (!this.typeInfoPatch) {
				// Settings controls read `widgetsSupported` on the next render; an open tab is not re-rendered.
				this.widgetsSupported = false;
				this.notifyUnsupported();
			}
		} else if (this.typeInfoPatch) {
			this.typeInfoPatch.uninstall();
			this.typeInfoPatch = null;
		}
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
