import { Notice, Platform, Plugin, setIcon, setTooltip, type EventRef } from "obsidian";
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
import { registerSchemaSettings, type SchemaSettingsHandle } from "./schema-settings/schemaSettings";
import { assignedTypes, getMetadataTypeManager, type MetadataTypeManager } from "./internals/detect";
import { ImprovedBasesSettings, ImprovedBasesSettingTab, mergeSettings } from "./settings";
import { WarningRegistry } from "./warnings/WarningRegistry";
import { WarningsModal } from "./warnings/WarningsModal";
import { conflictWarnings, schemaWarnings } from "./warnings/sources";
import { t, tn } from "./i18n";

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
	warnings = new WarningRegistry();
	typeInfoPatch: TypeInfoPatch | null = null;
	/** False when Obsidian internals are missing; widgets then stay off, commands keep working. */
	widgetsSupported = true;
	private registration: PluginTypeRegistration | null = null;
	private headerTypeChange: HeaderTypeChange | null = null;
	private windowRefs: EventRef[] = [];
	private schemaSettings: SchemaSettingsHandle | null = null;
	private env: WidgetEnv;
	private notified = false;
	private notifiedSkipped = false;
	private warningsModal: WarningsModal | null = null;

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
		const env: WidgetEnv = {
			membership: this.membership,
			query: this.query,
			writer: this.writer,
			app: this.app,
			overlays: new OverlayRegistry(),
			warnings: this.warnings,
			prefs: () => ({ defaultIcon: this.settings.defaultEntryIcon, conflictMarkers: this.settings.showConflictMarkers }),
		};
		this.env = env;
		this.watchWarningSources();
		this.widgetsSupported = getMetadataTypeManager(this.app) !== null;
		if (!this.widgetsSupported) this.notifyUnsupported();
		this.schemaSettings = registerSchemaSettings(this, env, this.registry);
		if (this.widgetsSupported) this.enableWidgets();
		this.register(() => this.disableWidgets());
		this.applySettings();
		this.registerWarningAccess();
		this.app.workspace.onLayoutReady(() => void this.registry.load());
		this.addSettingTab(new ImprovedBasesSettingTab(this.app, this));
	}

	/** Schema errors and field conflicts are state warnings, re-derived whenever the registry or the membership changes. */
	private watchWarningSources(): void {
		const schema = () => this.warnings.replace("schema", schemaWarnings(this.registry.errors()));
		const conflict = () => this.warnings.replace("conflict", conflictWarnings(this.membership.conflicts()));
		this.registry.on("changed", schema);
		this.membership.on("changed", conflict);
		this.register(() => {
			this.registry.off("changed", schema);
			this.membership.off("changed", conflict);
		});
	}

	/** Command, status bar item (desktop; hidden without warnings) and the list modal. */
	private registerWarningAccess(): void {
		this.addCommand({ id: "show-warnings", name: t("command.showWarnings"), callback: () => this.showWarnings() });
		this.register(() => this.warningsModal?.close());
		if (!Platform.isDesktop) return;
		const item = this.addStatusBarItem();
		item.addClass("improved-bases-status", "mod-clickable");
		setIcon(item.createSpan({ cls: "improved-bases-status-icon" }), "lucide-alert-triangle");
		const count = item.createSpan({ cls: "improved-bases-status-count" });
		const update = (): void => {
			const n = this.warnings.count;
			item.toggleClass("is-hidden", n === 0);
			count.setText(String(n));
			const label = tn("warnings.status", n);
			item.setAttribute("aria-label", label);
			if (typeof setTooltip === "function") setTooltip(item, label);
		};
		update();
		item.addEventListener("click", () => this.showWarnings());
		const ref = this.warnings.on("changed", update);
		this.register(() => this.warnings.offref(ref));
	}

	showWarnings(): void {
		this.warningsModal?.close();
		this.warningsModal = new WarningsModal(this.app, this.warnings, (basePath) => void this.schemaSettings?.open(basePath, null));
		this.warningsModal.open();
	}

	/** Pushes the settings that are not read lazily (the toolbar button) to their owners. */
	applySettings(): void {
		this.schemaSettings?.setToolbarButton(this.settings.showToolbarButton);
	}

	private notifyUnsupported() {
		if (this.notified) return;
		this.notified = true;
		const text = t("notice.unsupported", { plugin: this.manifest.name });
		new Notice(text + t("notice.seeWarnings"));
		this.warnings.report("plugin:unsupported", { text });
	}

	/** Registers the property types, installs the getTypeInfo patch and the header hook; a no-op while installed. */
	enableWidgets() {
		if (this.typeInfoPatch) return;
		const mtm = getMetadataTypeManager(this.app);
		if (!mtm) return;
		const registration = registerPluginTypes(mtm, { select: createGenericSelectWidget(this.env), relation: createGenericRelationWidget(this.env) });
		if (!this.notifiedSkipped) {
			this.notifiedSkipped = true;
			for (const id of registration.skipped) {
				const text = t("notice.typeTaken", { plugin: this.manifest.name, type: id });
				new Notice(text + t("notice.seeWarnings"));
				this.warnings.report(`plugin:typeTaken:${id}`, { text });
			}
		}
		this.registration = registration;
		let header: HeaderTypeChange | null = null;
		this.typeInfoPatch = installTypeInfoPatch(this.app, this.env, { relation: RelationWidget, select: SelectWidget }, { menuBase: () => header?.menuBase() ?? null });
		if (!this.typeInfoPatch) {
			registration.unregister();
			this.registration = null;
			this.widgetsSupported = false;
			this.notifyUnsupported();
			return;
		}
		header = installHeaderTypeChange(mtm, {
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
		if (header) this.attachWindows(header);
		// Fields typed select/relation still show the default widget Obsidian picked while the ids were unknown.
		refreshAssigned(mtm, registration.registered);
	}

	/** The header hook listens in the main window and every popout, including those opened later. */
	private attachWindows(header: HeaderTypeChange) {
		const { workspace } = this.app;
		const docs = new Set<Document>([document]);
		workspace.iterateAllLeaves((leaf) => docs.add(leaf.view.containerEl.ownerDocument));
		for (const doc of docs) header.attach(doc);
		this.windowRefs = [workspace.on("window-open", (win) => header.attach(win.doc)), workspace.on("window-close", (win) => header.detach(win.doc))];
	}

	/** Reverses `enableWidgets()`; fields typed select/relation fall back to text and keep their values. */
	disableWidgets() {
		for (const ref of this.windowRefs) this.app.workspace.offref(ref);
		this.windowRefs = [];
		this.headerTypeChange?.uninstall();
		this.headerTypeChange = null;
		this.typeInfoPatch?.uninstall();
		this.typeInfoPatch = null;
		const registration = this.registration;
		this.registration = null;
		if (!registration) return;
		registration.unregister();
		// Cells and panels still hold the removed widgets.
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
