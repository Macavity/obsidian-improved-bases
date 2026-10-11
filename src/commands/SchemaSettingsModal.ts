import { Modal, Setting, setIcon, type App, type ButtonComponent } from "obsidian";
import { referencesName } from "../schema/baseDoc";
import { BasePicker, openColorMenu } from "../widgets/pickers";
import type { OverlayRegistry } from "../widgets/types";
import { removals, renames, TYPES, validateDrafts, type DraftType, type FieldDraft, type OptionDraft } from "./schemaDraft";

export interface SchemaSettingsInput {
	basePath: string;
	state: { kind: "fields"; drafts: FieldDraft[] } | { kind: "error"; message: string; resettable: boolean };
	/** Datalist suggestions for field names. */
	propertyNames: string[];
	/** Target base candidates (a base may relate to itself). */
	basePaths: string[];
	overlays: OverlayRegistry;
	/** Whether the members of this base are known; renames and removals need them to migrate the notes. */
	membersKnown: () => boolean;
	/** View names of the base; new fields are added as columns to one of them. */
	views: string[];
	defaultViewIndex: number;
	/** Filter and formula expressions, to hint at references to a renamed field. */
	expressions: string[];
}

export interface SchemaSettingsHandlers {
	onSave: (drafts: FieldDraft[], addView: number) => Promise<void>;
	onReset: () => Promise<void>;
	/** Number of member notes holding a value for `name`. */
	countAffected: (name: string) => Promise<number>;
}

const MEMBERS_LOADING = "Base members are still loading, try again in a moment";

let instances = 0;

function basename(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.base$/, "");
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** "native", "native (text)" or "native (number, pinned)"; the pin decides the widget in this base, so its type wins. */
function nativeText(draft: FieldDraft): string {
	const label = draft.pinned ? String(draft.pinned.type) : draft.nativeLabel;
	if (label === null) return "native";
	return draft.pinned ? `native (${label}, pinned)` : `native (${label})`;
}

function typeText(draft: FieldDraft, type: DraftType): string {
	return type === "native" ? nativeText(draft) : type;
}

function summary(draft: FieldDraft): string {
	const parts = [draft.name.trim() || "Unnamed field", typeText(draft, draft.type)];
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
	private addView: number;
	/** Bumped on every list render and on close; pending confirmations of an older generation are stale. */
	private generation = 0;

	constructor(
		app: App,
		private readonly input: SchemaSettingsInput,
		private readonly handlers: SchemaSettingsHandlers,
	) {
		super(app);
		this.drafts = input.state.kind === "fields"
			? input.state.drafts.map((d) => ({ ...d, options: d.options.map((o) => ({ ...o })) }))
			: [];
		this.addView = input.defaultViewIndex;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("improved-bases-schema");
		this.setTitle(`Schema settings – ${basename(this.input.basePath)}`);
		if (this.input.state.kind === "error") this.renderError(this.input.state.message, this.input.state.resettable);
		else this.renderFields();
	}

	onClose(): void {
		this.generation++;
		this.contentEl.empty();
	}

	private renderError(message: string, resettable: boolean): void {
		this.contentEl.createDiv({ cls: "improved-bases-schema-error", text: message });
		this.renderFooter(resettable ? (b) => this.resetButton(b) : null);
	}

	/** Destructive reset that needs a second click to confirm. */
	private resetButton(b: ButtonComponent): void {
		let confirming = false;
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
					this.errorEl?.setText(errorText(e));
				},
			);
		});
	}

	private renderFields(): void {
		const { contentEl } = this;
		const datalist = contentEl.createEl("datalist", { attr: { id: this.listId } });
		for (const name of this.input.propertyNames) datalist.createEl("option", { attr: { value: name } });
		this.renderViewPicker();
		this.listEl = contentEl.createDiv({ cls: "improved-bases-field-list" });
		this.renderList();
		const add = contentEl.createEl("button", { cls: "improved-bases-add-field", attr: { type: "button" } });
		setIcon(add.createSpan({ cls: "improved-bases-add-field-icon" }), "plus");
		add.createSpan({ text: "Add field" });
		add.addEventListener("click", () => {
			const draft: FieldDraft = {
				originalName: null, originalBase: null, name: "", type: "native", nativeLabel: null,
				pinned: null, removed: false, multiple: false, icon: "", options: [],
			};
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

	/** Target view for new columns; only offered when there is a choice. */
	private renderViewPicker(): void {
		const { views } = this.input;
		if (views.length <= 1) return;
		new Setting(this.contentEl).setName("Add new fields to").addDropdown((d) => {
			d.selectEl.addClass("improved-bases-add-view");
			for (const [i, view] of views.entries()) d.addOption(String(i), view);
			d.setValue(String(this.addView)).onChange((v) => {
				this.addView = Number(v);
			});
		});
	}

	/** Error line plus a Cancel button and an optional primary action. */
	private renderFooter(primary: ((b: ButtonComponent) => void) | null): void {
		this.errorEl = this.contentEl.createDiv({ cls: "improved-bases-form-error" });
		const setting = new Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		if (primary) setting.addButton(primary);
	}

	private renderList(): void {
		const list = this.listEl;
		if (!list) return;
		this.generation++;
		list.empty();
		for (const draft of this.drafts) {
			if (draft.removed) this.renderRemovedRow(list, draft);
			else this.renderRow(list, draft);
		}
	}

	private renderRemovedRow(list: HTMLElement, draft: FieldDraft): void {
		const row = list.createDiv({ cls: "improved-bases-field-row improved-bases-field-removed" });
		const head = row.createDiv({ cls: "improved-bases-field-summary" });
		head.createSpan({ cls: "improved-bases-field-summary-text", text: summary(draft) });
		const undo = head.createEl("button", { cls: "improved-bases-undo", text: "Undo", attr: { type: "button" } });
		undo.addEventListener("click", () => {
			draft.removed = false;
			this.renderList();
		});
	}

	/** New fields go at once; known fields lose their values in the notes, so they need a confirmation. */
	private requestRemoval(row: HTMLElement, draft: FieldDraft): void {
		const name = draft.originalName;
		if (name === null) {
			this.drafts.remove(draft);
			this.expanded.delete(draft);
			this.renderList();
			return;
		}
		if (!this.input.membersKnown()) {
			this.errorEl?.setText(MEMBERS_LOADING);
			return;
		}
		this.renderConfirm(row, draft, name);
	}

	private renderConfirm(row: HTMLElement, draft: FieldDraft, name: string): void {
		row.empty();
		const confirm = row.createDiv({ cls: "improved-bases-field-confirm" });
		const warning = referencesName(this.input.expressions, name) ? " Filters or formulas reference it." : "";
		const text = confirm.createSpan({ text: `Remove '${name}' and its value from the notes?${warning}` });
		const remove = confirm.createEl("button", { cls: "mod-warning improved-bases-confirm-remove", text: "Remove", attr: { type: "button" } });
		remove.disabled = true;
		const keep = confirm.createEl("button", { cls: "improved-bases-confirm-keep", text: "Keep", attr: { type: "button" } });
		remove.addEventListener("click", () => {
			draft.removed = true;
			this.expanded.delete(draft);
			this.renderList();
		});
		keep.addEventListener("click", () => this.renderList());
		const generation = this.generation;
		const stale = (): boolean => generation !== this.generation || !row.isConnected;
		void this.handlers.countAffected(name).then(
			(count) => {
				if (stale()) return;
				text.setText(`Remove '${name}' and its value from ${count} ${count === 1 ? "note" : "notes"}?${warning}`);
				remove.disabled = false;
			},
			(e: unknown) => {
				if (stale()) return;
				this.errorEl?.setText(errorText(e));
				this.renderList();
			},
		);
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
			this.requestRemoval(row, draft);
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
				this.updateHint(hint, draft);
			});
			if (this.focusNext === draft) {
				this.focusNext = null;
				window.setTimeout(() => t.inputEl.focus(), 0);
			}
		});
		const hint = el.createDiv({ cls: "improved-bases-field-hint" });
		this.updateHint(hint, draft);
		const body = createDiv();
		new Setting(el).setName("Type").addDropdown((d) => {
			d.selectEl.addClass("improved-bases-field-type");
			for (const type of TYPES) d.addOption(type, typeText(draft, type));
			d.setValue(draft.type).onChange((v) => {
				draft.type = v as DraftType;
				refresh();
				this.renderBody(body, draft, refresh);
			});
		});
		el.appendChild(body);
		this.renderBody(body, draft, refresh);
	}

	/** Warns that a renamed field is still referenced by filters or formulas. */
	private updateHint(hint: HTMLElement, draft: FieldDraft): void {
		const from = draft.originalName;
		const show = from !== null && draft.name !== from && referencesName(this.input.expressions, from);
		hint.setText(show ? `Filters or formulas reference '${from}', update them manually after saving` : "");
		hint.hidden = !show;
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
			new Setting(el)
				.setName("Entry icon")
				.setDesc("Emoji for entries without an icon property. The system emoji picker opens with ctrl+cmd+space on macOS and with the Windows key + period on Windows.")
				.addText((t) => {
					t.inputEl.addClass("improved-bases-field-icon");
					t.inputEl.placeholder = "📄";
					t.setValue(draft.icon).onChange((v) => {
						draft.icon = v;
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
		const migrates = renames(this.drafts).length > 0 || removals(this.drafts).length > 0;
		if (migrates && !this.input.membersKnown()) errors.push(MEMBERS_LOADING);
		if (errors.length) {
			this.errorEl?.setText(errors.join(". "));
			return;
		}
		this.errorEl?.setText("");
		button.setDisabled(true);
		try {
			await this.handlers.onSave(this.drafts, this.addView);
		} catch (e) {
			button.setDisabled(false);
			this.errorEl?.setText(errorText(e));
			return;
		}
		this.close();
	}
}
