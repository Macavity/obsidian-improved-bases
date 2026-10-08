import { Notice, Plugin } from "obsidian";
import { installTypeInfoPatch, TypeInfoPatch } from "./internals/typeInfoPatch";
import { BaseQuery, createBaseQuery } from "./query/BaseQuery";
import { Membership } from "./schema/Membership";
import { SchemaRegistry } from "./schema/SchemaRegistry";
import { SchemaWriter } from "./schema/SchemaWriter";
import type { FieldSchema } from "./schema/types";
import type { WidgetHandle } from "./widgets/types";
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
		const env = { membership: this.membership, writer: this.writer, app: this.app };
		this.typeInfoPatch = installTypeInfoPatch(this.app, env, { relation: placeholderWidget, select: placeholderWidget });
		if (this.typeInfoPatch) {
			const patch = this.typeInfoPatch;
			this.register(() => patch.uninstall());
		} else {
			new Notice(`${this.manifest.name}: diese Obsidian-Version wird nicht unterstützt`);
		}
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

/** Placeholder until the relation/select widgets exist: marks the cell and shows the raw value. */
function placeholderWidget(el: HTMLElement, value: unknown, _ctx: unknown, field: FieldSchema): WidgetHandle {
	const text = JSON.stringify(value ?? "");
	el.createSpan({ text, attr: { "data-improved-bases": field.type } });
	return { type: field.type, focus() {} };
}
