import { Notice, Plugin } from "obsidian";
import { installTypeInfoPatch, TypeInfoPatch } from "./internals/typeInfoPatch";
import { installHeaderTypeChange, type HeaderBase, type HeaderTypeChange } from "./internals/headerTypeChange";
import { registerPluginTypes, type PluginTypeRegistration } from "./internals/typeRegistration";
import { resolveBase } from "./internals/toolbar";
import { createGenericRelationWidget } from "./widgets/GenericRelationWidget";
import { createGenericSelectWidget } from "./widgets/GenericSelectWidget";
import { BaseQuery, createBaseQuery } from "./query/BaseQuery";
import { Membership } from "./schema/Membership";
import { SchemaRegistry } from "./schema/SchemaRegistry";
import { SchemaWriter } from "./schema/SchemaWriter";
import { OverlayRegistry, WidgetEnv } from "./widgets/types";
import { RelationWidget } from "./widgets/RelationWidget";
import { SelectWidget } from "./widgets/SelectWidget";
import { registerSchemaSettings } from "./schema-settings/schemaSettings";
import { assignedTypes, getMetadataTypeManager, type MetadataTypeManager } from "./internals/detect";
import { ImprovedBasesSettings, ImprovedBasesSettingTab, mergeSettings } from "./settings";

/** Rebuilds the widgets of every property whose global type is one of `types`. */
function refreshAssigned(mtm: MetadataTypeManager, types: ReadonlySet<string>): void {
	for (const [name, type] of assignedTypes(mtm)) {
		if (!types.has(type)) continue;
		try {
			mtm.trigger("changed", name);
		} catch (e) {
			console.error("Improved Bases: refresh failed", e);
		}
	}
}

export default class ImprovedBasesPlugin extends Plugin {
	settings: ImprovedBasesSettings;
	query: BaseQuery;
	registry: SchemaRegistry;
	membership: Membership;
	writer: SchemaWriter;
	typeInfoPatch: TypeInfoPatch | null = null;
	/** False when Obsidian internals are missing; widgets then stay off, commands keep working. */
	widgetsSupported = true;
	private registration: PluginTypeRegistration | null = null;
	private headerTypeChange: HeaderTypeChange | null = null;
	private schemaSettings: { open: (basePath: string, viewName: string | null, focus?: { name: string; type: string }) => Promise<void> } | null = null;
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
		const env = { membership: this.membership, query: this.query, writer: this.writer, app: this.app, overlays: new OverlayRegistry() };
		this.env = env;
		this.widgetsSupported = getMetadataTypeManager(this.app) !== null;
		if (!this.widgetsSupported) this.notifyUnsupported();
		this.schemaSettings = registerSchemaSettings(this, env, this.registry);
		this.applyWidgetsEnabled();
		this.register(() => this.disableWidgets());
		this.app.workspace.onLayoutReady(() => void this.registry.load());
		this.addSettingTab(new ImprovedBasesSettingTab(this.app, this));
	}

	private notifyUnsupported() {
		if (this.notified) return;
		this.notified = true;
		new Notice(`${this.manifest.name}: this Obsidian version is not supported`);
	}

	/** Installs or removes property types, the getTypeInfo patch and the header hook according to `settings.widgetsEnabled`. */
	applyWidgetsEnabled() {
		if (this.settings.widgetsEnabled && this.widgetsSupported) {
			if (this.typeInfoPatch) return;
			this.enableWidgets();
		} else {
			this.disableWidgets();
		}
	}

	private enableWidgets() {
		const mtm = getMetadataTypeManager(this.app);
		if (!mtm) return;
		const registration = registerPluginTypes(mtm, { select: createGenericSelectWidget(this.env), relation: createGenericRelationWidget(this.env) });
		for (const id of registration.skipped) new Notice(`${this.manifest.name}: property type "${id}" is already registered by another plugin`);
		this.registration = registration;
		let header: HeaderTypeChange | null = null;
		this.typeInfoPatch = installTypeInfoPatch(this.app, this.env, { relation: RelationWidget, select: SelectWidget }, { pending: () => header?.pending() ?? null });
		if (!this.typeInfoPatch) {
			registration.unregister();
			this.registration = null;
			// Settings controls read `widgetsSupported` on the next render; an open tab is not re-rendered.
			this.widgetsSupported = false;
			this.notifyUnsupported();
			return;
		}
		header = installHeaderTypeChange(document, mtm, {
			resolve: (cell) => {
				const el = cell.closest(".internal-embed, .block-language-base, .view-content");
				const base = el && resolveBase(this.app, el);
				return base ? { basePath: base.path, viewName: base.viewName } : null;
			},
			pluginTypes: () => registration.registered,
			hasBaseEntry: (basePath, key) => this.registry.schemas().some((s) => s.basePath === basePath && s.fields.has(key)),
			open: (base: HeaderBase, focus) => void this.schemaSettings?.open(base.basePath, base.viewName, focus),
		});
		this.headerTypeChange = header;
		// Fields typed select/relation still show the default widget Obsidian picked while the ids were unknown.
		refreshAssigned(mtm, registration.registered);
	}

	private disableWidgets() {
		this.headerTypeChange?.uninstall();
		this.headerTypeChange = null;
		this.typeInfoPatch?.uninstall();
		this.typeInfoPatch = null;
		const registration = this.registration;
		this.registration = null;
		if (!registration) return;
		registration.unregister();
		// Fields typed select/relation fall back to text; cells and panels still hold the removed widgets.
		const mtm = getMetadataTypeManager(this.app);
		if (mtm) refreshAssigned(mtm, registration.registered);
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
