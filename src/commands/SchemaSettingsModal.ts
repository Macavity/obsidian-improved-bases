import { Modal, Setting, setIcon, type App, type ButtonComponent } from "obsidian";
import type { FieldSchema } from "../schema/types";
import { BasePicker, openColorMenu } from "../widgets/pickers";
import type { OverlayRegistry } from "../widgets/types";
import { renames, TYPES, validateDrafts, type FieldDraft, type OptionDraft } from "./schemaDraft";

export interface SchemaSettingsInput {
	basePath: string;
	state: { kind: "fields"; drafts: FieldDraft[] } | { kind: "error"; message: string };
	/** Datalist suggestions for field names. */
	propertyNames: string[];
	/** Target base candidates (a base may relate to itself). */
	basePaths: string[];
	overlays: OverlayRegistry;
	/** Whether the members of this base are known; a rename needs them to migrate the notes. */
	membersKnown: () => boolean;
}

export interface SchemaSettingsHandlers {
	onSave: (drafts: FieldDraft[]) => Promise<void>;
	onReset: () => Promise<void>;
}

let instances = 0;

function basename(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.base$/, "");
}

function summary(draft: FieldDraft): string {
	const parts = [draft.name.trim() || "Unnamed field", draft.type];
	if (draft.type === "relation" && draft.base) parts.push(draft.base);
	if (draft.type === "select") parts.push(`${draft.options.length} options`);
	if ((draft.type === "relation" || draft.type === "select") && draft.multiple) parts.push("multiple");
	return parts.join(" · ");
}

function iconButton(parent: HTMLElement, icon: string, label: string, cls: string): HTMLButtonElement {
	const button = parent.createEl("button", { cls: `clickable-icon ${cls}`, attr: { type: "button", "aria-label": label } });
	setIcon(button, icon);
	return button;
}

/** Edits all fields of one schema base; writing is left to the handlers. */
export class SchemaSettingsModal extends Modal {
	private readonly drafts: FieldDraft[];
	private readonly expanded = new Set<FieldDraft>();
	private readonly listId = `improved-bases-property-names-${++instances}`;
	private listEl: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;
	private focusNext: FieldDraft | null = null;

	constructor(
		app: App,
		private readonly input: SchemaSettingsInput,
		private readonly handlers: SchemaSettingsHandlers,
	) {
		super(app);
		this.drafts = input.state.kind === "fields"
			? input.state.drafts.map((d) => ({ ...d, options: d.options.map((o) => ({ ...o })) }))
			: [];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("improved-bases-schema");
		this.setTitle(`Schema settings – ${basename(this.input.basePath)}`);
		if (this.input.state.kind === "error") this.renderError(this.input.state.message);
		else this.renderFields();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderError(message: string): void {
		const { contentEl } = this;
		contentEl.createDiv({ cls: "improved-bases-schema-error", text: message });
		let confirming = false;
		this.renderFooter((b) => {
			b.setButtonText("Reset schema").setDestructive();
			b.buttonEl.addClass("improved-bases-reset");
			b.onClick(() => {
				if (!confirming) {
					confirming = true;
					b.setButtonText("Confirm reset");
					return;
				}
					b.setDisabled(true);
					void this.handlers.onReset().then(
						() => this.close(),
						(e: unknown) => {
							b.setDisabled(false);
							this.errorEl?.setText(e instanceof Error ? e.message : String(e));
						},
					);
				});
			});
	}

	private renderFields(): void {
		const { contentEl } = this;
		const datalist = contentEl.createEl("datalist", { attr: { id: this.listId } });
		for (const name of this.input.propertyNames) datalist.createEl("option", { attr: { value: name } });
		this.listEl = contentEl.createDiv({ cls: "improved-bases-field-list" });
		this.renderList();
		const add = contentEl.createEl("button", { cls: "improved-bases-add-field", attr: { type: "button" } });
		setIcon(add.createSpan({ cls: "improved-bases-add-field-icon" }), "plus");
		add.createSpan({ text: "Add field" });
		add.addEventListener("click", () => {
			const draft: FieldDraft = { originalName: null, originalBase: null, name: "", type: "text", multiple: false, options: [] };
			this.drafts.push(draft);
			this.expanded.add(draft);
			this.focusNext = draft;
			this.renderList();
		});
		this.renderFooter((b) => {
			b.setButtonText("Save").setCta();
			b.buttonEl.addClass("improved-bases-save");
			b.onClick(() => void this.save(b));
		});
	}

	/** Error line plus a Cancel button and one primary action. */
	private renderFooter(primary: (b: ButtonComponent) => void): void {
		this.errorEl = this.contentEl.createDiv({ cls: "improved-bases-form-error" });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(primary);
	}

	private renderList(): void {
		const list = this.listEl;
		if (!list) return;
		list.empty();
		for (const draft of this.drafts) this.renderRow(list, draft);
	}

	private renderRow(list: HTMLElement, draft: FieldDraft): void {
		const row = list.createDiv({ cls: "improved-bases-field-row" });
		const head = row.createDiv({ cls: "improved-bases-field-summary" });
		const chevron = head.createSpan({ cls: "improved-bases-field-chevron" });
		const text = head.createSpan({ cls: "improved-bases-field-summary-text" });
		const refresh = (): void => {
			text.setText(summary(draft));
			setIcon(chevron, this.expanded.has(draft) ? "chevron-down" : "chevron-right");
		};
		refresh();
		const trash = iconButton(head, "trash-2", "Remove field", "improved-bases-field-remove");
		trash.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.drafts.remove(draft);
			this.expanded.delete(draft);
			this.renderList();
		});
		head.addEventListener("click", () => {
			if (this.expanded.has(draft)) this.expanded.delete(draft);
			else this.expanded.add(draft);
			this.renderList();
		});
		if (this.expanded.has(draft)) this.renderEditor(row.createDiv({ cls: "improved-bases-field-editor" }), draft, refresh);
	}

	private renderEditor(el: HTMLElement, draft: FieldDraft, refresh: () => void): void {
		new Setting(el).setName("Name").addText((t) => {
			t.inputEl.addClass("improved-bases-field-name");
			t.inputEl.setAttribute("list", this.listId);
			t.setValue(draft.name).onChange((v) => {
				draft.name = v;
				refresh();
			});
			if (this.focusNext === draft) {
				this.focusNext = null;
				window.setTimeout(() => t.inputEl.focus(), 0);
			}
		});
		const body = createDiv();
		new Setting(el).setName("Type").addDropdown((d) => {
			d.selectEl.addClass("improved-bases-field-type");
			for (const type of TYPES) d.addOption(type, type);
			d.setValue(draft.type).onChange((v) => {
				draft.type = v as FieldSchema["type"];
				refresh();
				this.renderBody(body, draft, refresh);
			});
		});
		el.appendChild(body);
		this.renderBody(body, draft, refresh);
	}

	/** Type-dependent part of the editor; options stay in the draft when the type changes. */
	private renderBody(el: HTMLElement, draft: FieldDraft, refresh: () => void): void {
		el.empty();
		if (draft.type === "relation" || draft.type === "select") {
			new Setting(el).setName("Multiple values").addToggle((t) => {
				t.toggleEl.addClass("improved-bases-field-multiple");
				t.setValue(draft.multiple).onChange((v) => {
					draft.multiple = v;
					refresh();
				});
			});
		}
		if (draft.type === "relation") {
			new Setting(el).setName("Target base").addButton((b) => {
				b.buttonEl.addClass("improved-bases-field-base");
				b.setButtonText(draft.base ?? "Choose base");
				b.onClick(() => {
					new BasePicker(this.app, this.input.basePaths, (p) => {
						draft.base = p;
						b.setButtonText(p);
						refresh();
					}).open();
				});
			});
		}
		if (draft.type === "select") {
			const setting = new Setting(el).setName("Options");
			setting.settingEl.addClass("improved-bases-options");
			this.renderOptions(setting.controlEl, draft, refresh);
		}
	}

	private renderOptions(el: HTMLElement, draft: FieldDraft, refresh: () => void): void {
		el.empty();
		const rerender = (): void => {
			refresh();
			this.renderOptions(el, draft, refresh);
		};
		const list = el.createDiv({ cls: "improved-bases-option-list" });
		for (const option of draft.options) this.renderOption(list, draft, option, rerender);
		const add = el.createDiv({ cls: "improved-bases-option-add" });
		const input = add.createEl("input", {
			cls: "improved-bases-option-new",
			attr: { type: "text", placeholder: "New option", "aria-label": "New option" },
		});
		const submit = (): void => {
			const value = input.value.trim();
			if (!value) return;
			draft.options.push({ value, color: "grey" });
			rerender();
			el.querySelector<HTMLInputElement>(".improved-bases-option-new")?.focus();
		};
		input.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter" || evt.isComposing) return;
			evt.preventDefault();
			submit();
		});
		const button = add.createEl("button", { text: "Add", attr: { type: "button" } });
		button.addEventListener("click", submit);
	}

	private renderOption(list: HTMLElement, draft: FieldDraft, option: OptionDraft, rerender: () => void): void {
		const row = list.createDiv({ cls: "improved-bases-option-row" });
		const pill = row.createSpan({ cls: "improved-bases-pill", text: option.value, attr: { "data-color": option.color } });
		pill.addEventListener("click", (evt) => {
			openColorMenu(evt, (color) => {
				option.color = color;
				pill.setAttribute("data-color", color);
			}, this.input.overlays);
		});
		const edit = iconButton(row, "pencil", "Rename option", "improved-bases-option-edit");
		edit.addEventListener("click", () => {
			const input = createEl("input", { cls: "improved-bases-option-input", attr: { type: "text", "aria-label": "Option value" } });
			input.value = option.value;
			let done = false;
			const commit = (): void => {
				if (done) return;
				done = true;
				const value = input.value.trim();
				if (value) option.value = value;
				rerender();
			};
			input.addEventListener("keydown", (evt) => {
				if (evt.key !== "Enter" || evt.isComposing) return;
				evt.preventDefault();
				commit();
			});
			input.addEventListener("blur", commit);
			pill.replaceWith(input);
			input.focus();
			input.select();
		});
		const remove = row.createEl("button", {
			cls: "clickable-icon improved-bases-option-remove",
			text: "×",
			attr: { type: "button", "aria-label": "Remove option" },
		});
		remove.addEventListener("click", () => {
			draft.options.remove(option);
			rerender();
		});
	}

	private async save(button: ButtonComponent): Promise<void> {
		for (const draft of this.drafts) draft.name = draft.name.trim();
		const errors = validateDrafts(this.drafts, this.input.basePaths);
		if (renames(this.drafts).length > 0 && !this.input.membersKnown()) {
			errors.push("Base members are still loading, try again in a moment");
		}
		if (errors.length) {
			this.errorEl?.setText(errors.join(". "));
			return;
		}
		this.errorEl?.setText("");
		button.setDisabled(true);
		try {
			await this.handlers.onSave(this.drafts);
		} catch (e) {
			button.setDisabled(false);
			this.errorEl?.setText(e instanceof Error ? e.message : String(e));
			return;
		}
		this.close();
	}
}
