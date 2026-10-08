import { FuzzySuggestModal, Modal, Notice, Setting, TFile, type App, type Plugin } from "obsidian";
import type { RawFields } from "../schema/SchemaWriter";
import { COLORS, NATIVE_TYPES, type Color, type FieldSchema } from "../schema/types";
import type { WidgetEnv } from "../widgets/types";
import type { SchemaRegistry } from "../schema/SchemaRegistry";

export interface FieldDraft {
	name: string;
	type: FieldSchema["type"];
	multiple: boolean;
	base?: string;
	options?: Record<string, Color>;
}

const TYPES: FieldSchema["type"][] = ["relation", "select", ...NATIVE_TYPES];

/** Pure: the field node written under `improved-bases.fields.<name>`. */
export function draftToMutation(draft: FieldDraft): (f: RawFields) => void {
	return (fields) => {
		const name = draft.name.trim();
		if (draft.type === "relation") {
			fields[name] = { type: "relation", base: draft.base ?? "", multiple: draft.multiple };
		} else if (draft.type === "select") {
			const existing = fields[name]?.type === "select" ? (fields[name].options as Record<string, Color> | undefined) : undefined;
			fields[name] = { type: "select", multiple: draft.multiple, options: draft.options ?? existing ?? {} };
		} else {
			fields[name] = { type: draft.type };
		}
	};
}

export function validateDraft(draft: FieldDraft, basePaths: string[]): string[] {
	const errors: string[] = [];
	if (!draft.name.trim()) errors.push("Field name is required");
	if (!TYPES.includes(draft.type)) errors.push("Unknown type");
	if (draft.type === "relation" && !(draft.base && basePaths.includes(draft.base))) {
		errors.push("Choose an existing target base");
	}
	if (draft.type === "select") {
		for (const [value, color] of Object.entries(draft.options ?? {})) {
			if (!(COLORS as readonly string[]).includes(color)) errors.push(`Unknown color for "${value}"`);
		}
	}
	return errors;
}

/** Parses lines `value` or `value: color` (default grey); unknown colors are kept so `validateDraft` reports them. */
export function parseOptionLines(text: string): Record<string, Color> {
	const out: Record<string, Color> = {};
	for (const line of text.split("\n")) {
		const t = line.trim();
		const i = t.lastIndexOf(":");
		const value = (i > 0 ? t.slice(0, i) : t).trim();
		if (value) out[value] = i > 0 ? (t.slice(i + 1).trim() as Color) : "grey";
	}
	return out;
}

class BasePicker extends FuzzySuggestModal<string> {
	constructor(app: App, private readonly paths: string[], private readonly onPick: (p: string) => void) {
		super(app);
		this.setPlaceholder("Select a target base");
	}
	getItems(): string[] {
		return this.paths;
	}
	getItemText(p: string): string {
		return p;
	}
	onChooseItem(p: string): void {
		this.onPick(p);
	}
}

export class ConfigureFieldModal extends Modal {
	private draft: FieldDraft = { name: "", type: "text", multiple: false };
	private optionsText = "";
	private body: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly basePath: string,
		private readonly propertyNames: string[],
		private readonly onSubmit: (d: FieldDraft) => void,
	) {
		super(app);
	}

	private basePaths(): string[] {
		return this.app.vault.getFiles().filter((f) => f.extension === "base").map((f) => f.path).sort();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("improved-bases-configure");
		this.setTitle(`Configure field in ${this.basePath}`);
		new Setting(contentEl).setName("Field name").addText((t) => {
			t.inputEl.setAttribute("list", "improved-bases-property-names");
			t.inputEl.addClass("improved-bases-field-name");
			t.onChange((v) => (this.draft.name = v));
		});
		const list = contentEl.createEl("datalist", { attr: { id: "improved-bases-property-names" } });
		for (const n of this.propertyNames) list.createEl("option", { attr: { value: n } });
		new Setting(contentEl).setName("Type").addDropdown((d) => {
			d.selectEl.addClass("improved-bases-field-type");
			for (const t of TYPES) d.addOption(t, t);
			d.setValue(this.draft.type);
			d.onChange((v) => {
				this.draft.type = v as FieldSchema["type"];
				this.renderBody();
			});
		});
		this.body = contentEl.createDiv();
		this.renderBody();
		this.errorEl = contentEl.createDiv({ cls: "improved-bases-form-error" });
		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit()))
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
	}

	private renderBody(): void {
		const el = this.body;
		if (!el) return;
		el.empty();
		const { type } = this.draft;
		if (type === "relation" || type === "select") {
			new Setting(el).setName("Multiple values").addToggle((t) => {
				t.toggleEl.addClass("improved-bases-field-multiple");
				t.setValue(this.draft.multiple).onChange((v) => (this.draft.multiple = v));
			});
		}
		if (type === "relation") {
			new Setting(el).setName("Target base").addButton((b) => {
				b.buttonEl.addClass("improved-bases-field-base");
				b.setButtonText(this.draft.base ?? "Choose base");
				b.onClick(() => {
					new BasePicker(this.app, this.basePaths(), (p) => {
						this.draft.base = p;
						b.setButtonText(p);
					}).open();
				});
			});
		}
		if (type === "select") {
			new Setting(el).setName("Options").setDesc(`One per line, optionally "value: color". Colors: ${COLORS.join(", ")}.`).addTextArea((t) => {
				t.inputEl.addClass("improved-bases-field-options");
				t.setValue(this.optionsText).onChange((v) => (this.optionsText = v));
			});
		}
	}

	private submit(): void {
		const draft: FieldDraft = { ...this.draft, name: this.draft.name.trim() };
		if (draft.type === "select" && this.optionsText.trim()) draft.options = parseOptionLines(this.optionsText);
		const errors = validateDraft(draft, this.basePaths());
		if (errors.length) {
			this.errorEl?.setText(errors.join(". "));
			return;
		}
		this.close();
		this.onSubmit(draft);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Schema base the command acts on: the active schema `.base`, or the first schema base containing the active note. */
function targetBase(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): string | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!(file instanceof TFile)) return null;
	if (file.extension === "base") return registry.schemas().some((s) => s.basePath === file.path) ? file.path : null;
	if (file.extension !== "md" || !env.membership.ready) return null;
	return env.membership.schemaBasesOf(file.path)[0] ?? null;
}

export function registerConfigureField(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): void {
	plugin.addCommand({
		id: "configure-field",
		name: "Configure field",
		checkCallback: (checking) => {
			const basePath = targetBase(plugin, env, registry);
			if (!basePath) return false;
			if (!checking) {
				const names = new Set<string>();
				for (const f of env.membership.targetEntries(basePath) ?? []) {
					for (const k of Object.keys(plugin.app.metadataCache.getFileCache(f)?.frontmatter ?? {})) {
						if (k !== "position") names.add(k);
					}
				}
				new ConfigureFieldModal(plugin.app, basePath, [...names].sort(), (draft) => {
					env.writer.update(basePath, draftToMutation(draft)).catch((e: unknown) => {
						new Notice(`Could not save field: ${e instanceof Error ? e.message : String(e)}`);
					});
				}).open();
			}
			return true;
		},
	});
}
