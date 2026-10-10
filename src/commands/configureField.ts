import { type DropdownComponent, Modal, Notice, Setting, TFile, type App, type Plugin } from "obsidian";
import type { RawFields } from "../schema/SchemaWriter";
import { COLORS, isColor, NATIVE_TYPES, type Color, type FieldSchema } from "../schema/types";
import { findOwnKey, isUnsafeKey } from "../schema/keys";
import { BasePicker } from "../widgets/pickers";
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

/** Pure: the schema node for a draft; a select without options keeps the options of `prev` when that is a select. */
export function fieldNode(draft: FieldDraft, prev: RawFields[string] | undefined): RawFields[string] {
	if (draft.type === "relation") return { type: "relation", base: draft.base ?? "", multiple: draft.multiple };
	if (draft.type === "select") {
		const existing = prev?.type === "select" ? (prev.options as Record<string, Color> | undefined) : undefined;
		return { type: "select", multiple: draft.multiple, options: draft.options ?? existing ?? {} };
	}
	return { type: draft.type };
}

/** Pure: the field node written under `improved-bases.fields.<name>`; reuses an existing key case-insensitively. */
export function draftToMutation(draft: FieldDraft): (f: RawFields) => void {
	return (fields) => {
		const typed = draft.name.trim();
		if (!typed || isUnsafeKey(typed)) return;
		const name = findOwnKey(fields, typed) ?? typed;
		fields[name] = fieldNode(draft, Object.hasOwn(fields, name) ? fields[name] : undefined);
	};
}

/** `existing`: lowercased field name → current name and type. A different type is a collision. */
export function validateDraft(
	draft: FieldDraft,
	basePaths: string[],
	existing: ReadonlyMap<string, { name: string; type: string }> = new Map(),
): string[] {
	const errors: string[] = [];
	const name = draft.name.trim();
	if (!name) errors.push("Field name is required");
	else if (isUnsafeKey(name)) errors.push(`"${name}" is a reserved name`);
	const clash = existing.get(name.toLowerCase());
	if (clash && clash.type !== draft.type) errors.push(`Field '${clash.name}' already exists with type ${clash.type}`);
	if (!TYPES.includes(draft.type)) errors.push("Unknown type");
	if (draft.type === "relation" && !(draft.base && basePaths.includes(draft.base))) {
		errors.push("Choose an existing target base");
	}
	if (draft.type === "select") {
		for (const [value, color] of Object.entries(draft.options ?? {})) {
			if (!isColor(color)) errors.push(`Unknown color for "${value}"`);
		}
	}
	return errors;
}

/** Parses lines `value` or `value: color` (default grey); unknown colors are kept so `validateDraft` reports them. */
export function parseOptionLines(text: string): { options: Record<string, Color>; errors: string[] } {
	const options: Record<string, Color> = Object.create(null) as Record<string, Color>;
	const errors: string[] = [];
	for (const line of text.split("\n")) {
		const t = line.trim();
		const i = t.lastIndexOf(":");
		const value = (i > 0 ? t.slice(0, i) : t).trim();
		if (!value) continue;
		if (isUnsafeKey(value)) {
			errors.push(`"${value}" is a reserved option name`);
			continue;
		}
		options[value] = i > 0 ? (t.slice(i + 1).trim() as Color) : "grey";
	}
	return { options, errors };
}

/** Pure: draft from the form state; for an existing field an emptied options textarea clears the options. */
export function buildDraft(base: FieldDraft, optionsText: string, existed: boolean): { draft: FieldDraft; errors: string[] } {
	const draft: FieldDraft = { ...base, name: base.name.trim() };
	const errors: string[] = [];
	if (draft.type === "select") {
		if (optionsText.trim()) {
			const parsed = parseOptionLines(optionsText);
			draft.options = parsed.options;
			errors.push(...parsed.errors);
		} else if (existed) {
			draft.options = {};
		}
	}
	return { draft, errors };
}

class ConfigureFieldModal extends Modal {
	private draft: FieldDraft = { name: "", type: "text", multiple: false };
	private optionsText = "";
	private body: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;
	private typeDropdown: DropdownComponent | null = null;
	private prefilled: string | null = null;

	/** Loads type, multiple, base and options of an existing field whose name matches case-insensitively. */
	private prefill(typed: string): void {
		const hit = this.existing.get(typed.trim().toLowerCase());
		if (!hit || this.prefilled === hit.name) return;
		this.prefilled = hit.name;
		const { field } = hit;
		this.draft.type = field.type;
		this.draft.multiple = field.type === "relation" || field.type === "select" ? field.multiple : false;
		this.draft.base = field.type === "relation" ? field.base : undefined;
		this.optionsText = field.type === "select" ? field.options.map((o) => `${o.value}: ${o.color}`).join("\n") : "";
		this.typeDropdown?.setValue(field.type);
		this.renderBody();
	}

	constructor(
		app: App,
		private readonly basePath: string,
		private readonly propertyNames: string[],
		private readonly existing: ReadonlyMap<string, { name: string; field: FieldSchema }>,
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
			t.onChange((v) => {
				this.draft.name = v;
				this.prefill(v);
			});
		});
		const list = contentEl.createEl("datalist", { attr: { id: "improved-bases-property-names" } });
		for (const n of this.propertyNames) list.createEl("option", { attr: { value: n } });
		new Setting(contentEl).setName("Type").addDropdown((d) => {
			d.selectEl.addClass("improved-bases-field-type");
			for (const t of TYPES) d.addOption(t, t);
			this.typeDropdown = d;
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
		const { draft, errors: lineErrors } = buildDraft(this.draft, this.optionsText, this.existing.has(this.draft.name.trim().toLowerCase()));
		const types = new Map([...this.existing].map(([k, v]) => [k, { name: v.name, type: v.field.type }]));
		const errors = [...lineErrors, ...validateDraft(draft, this.basePaths(), types)];
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

/** Pure: schema bases the command can act on for the active file (`.base` itself, or the bases containing the note). */
export function candidateBases(file: { path: string; extension: string }, schemaPaths: string[], ready: boolean, membershipBases: (path: string) => string[]): string[] {
	if (file.extension === "base") return schemaPaths.includes(file.path) ? [file.path] : [];
	if (file.extension !== "md" || !ready) return [];
	return membershipBases(file.path);
}

function targetBases(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): string[] {
	const file = plugin.app.workspace.getActiveFile();
	if (!(file instanceof TFile)) return [];
	return candidateBases(file, registry.schemas().map((s) => s.basePath), env.membership.ready, (p) => env.membership.schemaBasesOf(p));
}

export function registerConfigureField(plugin: Plugin, env: WidgetEnv, registry: SchemaRegistry): void {
	const openModal = (basePath: string): void => {
		const names = new Set<string>();
		for (const f of env.membership.targetEntries(basePath) ?? []) {
			for (const k of Object.keys(plugin.app.metadataCache.getFileCache(f)?.frontmatter ?? {})) {
				if (k !== "position") names.add(k);
			}
		}
		const existing = registry.schemas().find((x) => x.basePath === basePath)?.fields ?? new Map();
		new ConfigureFieldModal(plugin.app, basePath, [...names].sort(), existing, (draft) => {
			env.writer.update(basePath, draftToMutation(draft)).catch((e: unknown) => {
				new Notice(`Could not save field: ${e instanceof Error ? e.message : String(e)}`);
			});
		}).open();
	};
	plugin.addCommand({
		id: "configure-field",
		name: "Configure field",
		checkCallback: (checking) => {
			const bases = targetBases(plugin, env, registry);
			if (!bases.length) return false;
			if (!checking) {
				if (bases.length === 1) openModal(bases[0] as string);
				else new BasePicker(plugin.app, bases, openModal).open();
			}
			return true;
		},
	});
}
