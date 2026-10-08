import { App, Component, MarkdownView, TFile, debounce, editorInfoField } from "obsidian";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type ImprovedBasesPlugin from "./main";
import {
	FilePickModal,
	openSelectMenu,
	renderRelation,
	renderSelect,
	writeRelation,
	writeSelect,
} from "./fields";
import { EntitySchema, schemaForPath } from "./schema";

// inline: next to native .metadata-container (reading + live preview)
// header: prepended to view.contentEl (above both modes, does not scroll)
// cm: CodeMirror block widget (editing modes only)
export type PanelMode = "off" | "inline" | "header" | "cm";

export function buildPanel(
	plugin: ImprovedBasesPlugin,
	file: TFile,
	schema: EntitySchema
): HTMLElement {
	const app = plugin.app;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const panel = createDiv({ cls: "ib-panel" });
	for (const [name, field] of Object.entries(schema.fields)) {
		const row = panel.createDiv({ cls: "ib-row" });
		row.createDiv({ cls: "ib-label", text: name });
		const val = row.createDiv({ cls: "ib-value" });
		if (field.kind === "relation") {
			renderRelation(app, val, fm[name], file.path);
			const btn = val.createSpan({ cls: "ib-edit", text: "✎" });
			btn.onclick = () =>
				new FilePickModal(app, plugin.watcher(field.base).files, (f) =>
					writeRelation(app, file, name, f)
				).open();
		} else {
			renderSelect(val, fm[name], field.options);
			val.addClass("ib-editable");
			val.onclick = (evt) => openSelectMenu(evt, field.options, (v) => writeSelect(app, file, name, v));
		}
	}
	// keep CodeMirror / reading view from handling our clicks
	panel.addEventListener("mousedown", (e) => e.stopPropagation());
	return panel;
}

export class PanelManager extends Component {
	mode: PanelMode = "inline";
	private refreshCm = StateEffect.define<null>();
	private observed = new WeakSet<MarkdownView>();

	constructor(private app: App, private plugin: ImprovedBasesPlugin) {
		super();
	}

	onload(): void {
		const refresh = debounce(() => this.refreshAll(), 30, true);
		this.registerEvent(this.app.workspace.on("layout-change", refresh));
		this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.metadataCache.on("changed", refresh));
		this.plugin.registerEditorExtension(this.cmExtension());
		this.app.workspace.onLayoutReady(refresh);
		this.register(() => this.clear());
	}

	setMode(mode: PanelMode) {
		this.mode = mode;
		this.refreshAll();
	}

	refreshAll() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) this.refresh(leaf.view);
		}
	}

	private clear() {
		document.querySelectorAll(".ib-panel").forEach((el) => el.remove());
		document.querySelectorAll(".ib-hide-props").forEach((el) => el.removeClass("ib-hide-props"));
	}

	// Native panels are (re)rendered lazily, e.g. on first switch to reading mode,
	// without any workspace event. Watch the view DOM for new .metadata-container nodes.
	private observe(view: MarkdownView) {
		if (this.observed.has(view)) return;
		this.observed.add(view);
		const obs = new MutationObserver((records) => {
			const hit = records.some((r) =>
				Array.from(r.addedNodes).some(
					(n) => n instanceof HTMLElement && !n.hasClass("ib-panel") &&
						(n.hasClass("metadata-container") || !!n.querySelector?.(".metadata-container"))
				)
			);
			if (hit) this.refresh(view);
		});
		obs.observe(view.contentEl, { childList: true, subtree: true });
		this.register(() => obs.disconnect());
	}

	private refresh(view: MarkdownView) {
		this.observe(view);
		const file = view.file;
		const schema = file ? schemaForPath(file.path) : null;
		view.containerEl.toggleClass("ib-hide-props", !!schema && this.mode !== "off");
		view.containerEl.querySelectorAll(".ib-panel:not(.ib-cm)").forEach((el) => el.remove());
		// poke CodeMirror so the cm widget re-renders / disappears
		(view.editor as any)?.cm?.dispatch({ effects: this.refreshCm.of(null) });
		if (!file || !schema) return;

		if (this.mode === "inline") {
			view.containerEl
				.querySelectorAll(".metadata-container")
				.forEach((mc) => mc.before(buildPanel(this.plugin, file, schema)));
		} else if (this.mode === "header") {
			view.contentEl.prepend(buildPanel(this.plugin, file, schema));
		}
	}

	private cmExtension() {
		const manager = this;
		const plugin = this.plugin;

		class PanelWidget extends WidgetType {
			constructor(private file: TFile, private schema: EntitySchema, private view: MarkdownView, private stamp: number) {
				super();
			}
			eq(other: PanelWidget) {
				return other.stamp === this.stamp && other.file === this.file;
			}
			toDOM() {
				const el = buildPanel(plugin, this.file, this.schema);
				el.addClass("ib-cm");
				return el;
			}
			ignoreEvent() {
				return true;
			}
		}

		let stamp = 0;
		const build = (state: EditorView["state"]): DecorationSet => {
			if (manager.mode !== "cm") return Decoration.none;
			const info = state.field(editorInfoField, false);
			const file = info?.file;
			const schema = file ? schemaForPath(file.path) : null;
			if (!file || !schema || !(info instanceof MarkdownView)) return Decoration.none;
			return Decoration.set([
				Decoration.widget({ widget: new PanelWidget(file, schema, info, ++stamp), block: true, side: -1 }).range(0),
			]);
		};

		return StateField.define<DecorationSet>({
			create: build,
			update: (deco, tr) =>
				tr.effects.some((e) => e.is(manager.refreshCm)) ? build(tr.state) : deco.map(tr.changes),
			provide: (f) => EditorView.decorations.from(f),
		});
	}
}
