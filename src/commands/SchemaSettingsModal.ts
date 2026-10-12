import { ButtonComponent, Modal, setIcon, ToggleComponent, type App } from "obsidian";
import { referencesName } from "../schema/baseDoc";
import { openOptionEditMenu } from "../widgets/pickers";
import { renderIcon } from "../widgets/icons";
import type { OverlayRegistry } from "../widgets/types";
import { conflictHint, removals, renames, TYPES, validateDrafts, type DraftType, type FieldDraft, type OptionDraft, type OtherDefinition } from "./schemaDraft";

export interface SchemaSettingsInput {
	basePath: string;
	state: { kind: "fields"; drafts: FieldDraft[] } | { kind: "error"; message: string; resettable: boolean };
	/** Default icon of this base's entries in relations; "" = none (📄). */
	icon: string;
	/** Target base candidates (a base may relate to itself). */
	basePaths: string[];
	/** Default entry icon of a base, for the target box and the details column; null without one. */
	baseIcon: (path: string) => string | null;
	overlays: OverlayRegistry;
	/** Whether the members of this base are known; renames and removals need them to migrate the notes. */
	membersKnown: () => boolean;
	/** View names of the base; new fields are added as columns to one of them. */
	views: string[];
	defaultViewIndex: number;
	/** Filter and formula expressions, to hint at references to a renamed field. */
	expressions: string[];
	/** Other schema bases' definitions of a field name (case-insensitive), for the conflict hint. */
	otherDefinitions: (name: string) => OtherDefinition[];
}

export interface SchemaSettingsHandlers {
	onSave: (drafts: FieldDraft[], addView: number, icon: string) => Promise<void>;
	onReset: () => Promise<void>;
	/** Number of member notes holding a value for `name`. */
	countAffected: (name: string) => Promise<number>;
}

const MEMBERS_LOADING = "Base members are still loading, try again in a moment";
const IDLE_STATUS = "Changes are written to the base on Save. Renames and removals also update the member notes.";
const ICON_HELP = "Emoji shown for this base's entries in relations, unless a note has its own icon property. The system emoji picker opens with ctrl+cmd+space on macOS and with the Windows key + period on Windows.";

/** Labels for Obsidian's property types. */
const NATIVE_LABELS: Record<string, string> = {
	text: "Text",
	multitext: "List",
	list: "List",
	tags: "Tags",
	aliases: "Aliases",
	number: "Number",
	checkbox: "Checkbox",
	date: "Date",
	datetime: "Date & time",
};

/** Generic icon for a base without a default entry icon. */
const BASE_ICON = "lucide-layout-list";

/** Lucide icons for Obsidian's property types. */
const NATIVE_ICONS: Record<string, string> = {
	text: "lucide-text",
	multitext: "lucide-list",
	list: "lucide-list",
	tags: "lucide-tags",
	aliases: "lucide-forward",
	number: "lucide-binary",
	checkbox: "lucide-check-square",
	date: "lucide-calendar",
	datetime: "lucide-clock",
};

function basename(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.base$/, "");
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** "Text", "Native" (type unknown) or "Number (pinned)"; the pin decides the widget in this base, so its type wins. */
function nativeText(draft: FieldDraft): string {
	const type = draft.pinned ? String(draft.pinned.type) : draft.nativeLabel;
	if (type === null) return "Native";
	const label = NATIVE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
	return draft.pinned ? `${label} (pinned)` : label;
}

function typeText(draft: FieldDraft, type: DraftType): string {
	if (type === "relation") return "Relation";
	if (type === "select") return "Select";
	return nativeText(draft);
}

/** Change detection for the footer: the drafts and the base icon as saved. */
function snapshot(drafts: FieldDraft[], icon: string): string {
	return JSON.stringify({ drafts, icon });
}

function typeIcon(draft: FieldDraft): string {
	if (draft.type === "relation") return "lucide-link";
	if (draft.type === "select") return "lucide-circle-dot";
	const label = draft.pinned ? String(draft.pinned.type) : draft.nativeLabel;
	return (label && NATIVE_ICONS[label]) ?? "lucide-text";
}

/** Only plugin types have details to expand. */
function expandable(draft: FieldDraft): boolean {
	return draft.type === "relation" || draft.type === "select";
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? "" : "s"}`;
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
	private listEl: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private buttonsEl: HTMLElement | null = null;
	private primary: ((b: ButtonComponent) => void) | null = null;
	private readonly initial: string;
	private focusNext: FieldDraft | null = null;
	private addView: number;
	private icon: string;
	private query = "";
	private searchEl: HTMLInputElement | null = null;
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
		this.icon = input.icon;
		this.initial = snapshot(this.drafts, this.icon);
	}

	/** Whether saving would change the base. */
	private dirty(): boolean {
		return this.input.state.kind === "fields" && snapshot(this.drafts, this.icon.trim()) !== this.initial;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("improved-bases-schema");
		this.modalEl.addClass("improved-bases-schema-modal");
		this.setTitle(`Schema settings – ${basename(this.input.basePath)}`);
		if (this.input.state.kind === "error") this.renderError(this.input.state.message, this.input.state.resettable);
		else this.renderFields();
		// Obsidian focuses the first input (the icon field); nothing in the dialog deserves the initial focus.
		window.setTimeout(() => {
			const active = document.activeElement;
			if (active instanceof HTMLElement && active !== this.modalEl && this.modalEl.contains(active)) active.blur();
		}, 0);
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
		this.renderHeader();
		this.renderToolbar();
		const table = contentEl.createDiv({ cls: "improved-bases-table" });
		const head = table.createDiv({ cls: "improved-bases-column-head" });
		for (const label of ["", "Field name", "Type", "Details", ""]) head.createSpan({ text: label });
		this.listEl = table.createDiv({ cls: "improved-bases-field-list" });
		this.renderList();
		this.renderFooter((b) => {
			b.setButtonText("Save").setCta();
			b.buttonEl.addClass("improved-bases-save");
			b.onClick(() => void this.save(b));
		});
	}

	/** The base's default entry icon, next to the modal title. */
	private renderHeader(): void {
		const header = this.titleEl.parentElement ?? this.contentEl;
		const field = header.createEl("label", { cls: "improved-bases-base-icon", attr: { title: ICON_HELP } });
		field.createSpan({ text: "Default entry icon" });
		const input = field.createEl("input", {
			cls: "improved-bases-base-icon-input",
			attr: { type: "text", placeholder: "📄", "aria-label": "Default entry icon" },
		});
		input.value = this.icon;
		input.addEventListener("input", () => {
			this.icon = input.value;
			this.updateStatus();
		});
	}

	/** Search, the target view for new columns (only offered when there is a choice) and the add button. */
	private renderToolbar(): void {
		const bar = this.contentEl.createDiv({ cls: "improved-bases-toolbar" });
		const search = bar.createDiv({ cls: "search-input-container improved-bases-search" });
		const input = search.createEl("input", { attr: { type: "search", placeholder: "Find a field…", "aria-label": "Find a field" } });
		this.searchEl = input;
		input.addEventListener("input", () => {
			this.query = input.value.trim().toLowerCase();
			this.renderList();
		});
		this.renderViewPicker(bar);
		const add = bar.createEl("button", { cls: "mod-cta improved-bases-add-field", attr: { type: "button" } });
		setIcon(add.createSpan({ cls: "improved-bases-add-field-icon" }), "lucide-plus");
		add.createSpan({ text: "Add field" });
		add.addEventListener("click", () => {
			const draft: FieldDraft = {
				originalName: null, originalBase: null, name: "", type: "native", nativeLabel: null,
				pinned: null, removed: false, multiple: false, options: [],
			};
			this.drafts.push(draft);
			this.focusNext = draft;
			this.query = "";
			if (this.searchEl) this.searchEl.value = "";
			this.renderList();
		});
	}

	private renderViewPicker(bar: HTMLElement): void {
		const { views } = this.input;
		if (views.length <= 1) return;
		const label = bar.createEl("label", { cls: "improved-bases-add-view-label" });
		label.createSpan({ text: "Add new fields to" });
		const select = label.createEl("select", { cls: "dropdown improved-bases-add-view" });
		for (const [i, view] of views.entries()) select.createEl("option", { text: view, attr: { value: String(i) } });
		select.value = String(this.addView);
		select.addEventListener("change", () => {
			this.addView = Number(select.value);
		});
	}

	/** Status line (pending renames and removals, or the last error) plus the buttons. */
	private renderFooter(primary: ((b: ButtonComponent) => void) | null): void {
		const footer = this.contentEl.createDiv({ cls: "improved-bases-footer" });
		const status = footer.createDiv({ cls: "improved-bases-footer-status" });
		this.statusEl = status.createDiv({ cls: "improved-bases-rename-status" });
		this.errorEl = status.createDiv({ cls: "improved-bases-form-error" });
		this.buttonsEl = footer.createDiv({ cls: "improved-bases-footer-buttons" });
		this.primary = primary;
		this.updateStatus();
	}

	/** Close while nothing changed; Cancel and Save once there is something to save. The reset button stays next to Close. */
	private renderButtons(): void {
		const el = this.buttonsEl;
		if (!el) return;
		const dirty = this.dirty();
		if (el.dataset.dirty === String(dirty) && el.hasChildNodes()) return;
		el.dataset.dirty = String(dirty);
		el.empty();
		if (this.input.state.kind === "error") {
			new ButtonComponent(el).setButtonText("Close").onClick(() => this.close()).buttonEl.addClass("improved-bases-close");
			if (this.primary) this.primary(new ButtonComponent(el));
			return;
		}
		if (!dirty) {
			new ButtonComponent(el).setButtonText("Close").onClick(() => this.close()).buttonEl.addClass("improved-bases-close");
			return;
		}
		new ButtonComponent(el).setButtonText("Cancel").onClick(() => this.close()).buttonEl.addClass("improved-bases-cancel");
		if (this.primary) this.primary(new ButtonComponent(el));
	}

	/** Pending renames and removals, as a reminder that Save migrates the notes. */
	private updateStatus(): void {
		this.renderButtons();
		const el = this.statusEl;
		if (!el || this.input.state.kind !== "fields") return;
		el.empty();
		const pending = renames(this.drafts.map((d) => ({ ...d, name: d.name.trim() }))).filter((r) => r.to !== "");
		const removed = removals(this.drafts);
		if (!pending.length && !removed.length) {
			el.removeClass("has-pending");
			setIcon(el.createSpan({ cls: "improved-bases-status-icon" }), "lucide-info");
			el.createSpan({ text: IDLE_STATUS });
			return;
		}
		el.addClass("has-pending");
		const parts = [];
		if (pending.length) parts.push(plural(pending.length, "pending rename"));
		if (removed.length) parts.push(plural(removed.length, "removal"));
		el.createSpan({ cls: "improved-bases-status-badge", text: String(pending.length + removed.length) });
		const text = el.createDiv({ cls: "improved-bases-status-text" });
		text.createEl("b", { text: parts.join(", ") });
		const details = [...pending.map((r) => `${r.from} → ${r.to}`), ...removed.map((name) => `${name} removed`)];
		const shown = details.slice(0, 2);
		if (details.length > 2) shown.push(`+${details.length - 2} more`);
		text.createEl("p", { text: shown.join(" · ") });
	}

	private renderList(): void {
		const list = this.listEl;
		if (!list) return;
		this.generation++;
		list.empty();
		const shown = this.drafts.filter((d) => !this.query || d.name.toLowerCase().includes(this.query));
		for (const draft of shown) {
			if (draft.removed) this.renderRemovedRow(list, draft);
			else this.renderRow(list, draft);
		}
		if (!shown.length) list.createDiv({ cls: "improved-bases-field-empty", text: this.drafts.length ? "No field matches the search" : "No fields yet" });
		this.updateStatus();
	}

	private renderRemovedRow(list: HTMLElement, draft: FieldDraft): void {
		const row = list.createDiv({ cls: "improved-bases-field-row improved-bases-field-removed" });
		const main = row.createDiv({ cls: "improved-bases-field-main" });
		main.createSpan({ cls: "improved-bases-field-disclosure" });
		main.createSpan({ cls: "improved-bases-field-removed-name", text: draft.name.trim() || "Unnamed field" });
		main.createSpan({ cls: "improved-bases-field-details", text: "Removed on save" });
		const undo = main.createEl("button", { cls: "improved-bases-undo", text: "Undo", attr: { type: "button" } });
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
		setIcon(confirm.createSpan({ cls: "improved-bases-warning-icon" }), "lucide-alert-triangle");
		const warning = referencesName(this.input.expressions, name) ? " Filters or formulas reference it." : "";
		const text = confirm.createSpan({ text: `Remove '${name}' and its value from the notes?${warning}` });
		const keep = confirm.createEl("button", { cls: "improved-bases-confirm-keep", text: "Keep", attr: { type: "button" } });
		const remove = confirm.createEl("button", { cls: "mod-warning improved-bases-confirm-remove", text: "Remove", attr: { type: "button" } });
		remove.disabled = true;
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

	/** One table row: disclosure, name, type, details, remove; hints and the detail editor below. */
	private renderRow(list: HTMLElement, draft: FieldDraft): void {
		const row = list.createDiv({ cls: "improved-bases-field-row" });
		const main = row.createDiv({ cls: "improved-bases-field-main" });
		const disclosure = main.createEl("button", { cls: "improved-bases-field-disclosure", attr: { type: "button", "aria-label": "Show details" } });
		setIcon(disclosure, "lucide-chevron-right");
		const name = main.createEl("input", {
			cls: "improved-bases-field-name",
			attr: { type: "text", placeholder: "Field name", "aria-label": "Field name" },
		});
		name.value = draft.name;
		const typeWrap = main.createDiv({ cls: "improved-bases-type-select" });
		const typeIconEl = typeWrap.createSpan({ cls: "improved-bases-type-icon" });
		const type = typeWrap.createEl("select", { cls: "improved-bases-field-type", attr: { "aria-label": "Field type" } });
		for (const t of TYPES) type.createEl("option", { text: typeText(draft, t), attr: { value: t } });
		type.value = draft.type;
		setIcon(typeWrap.createSpan({ cls: "improved-bases-type-chevron" }), "lucide-chevron-down");
		const details = main.createDiv({ cls: "improved-bases-field-details" });
		const trash = iconButton(main, "lucide-trash-2", "Remove field", "improved-bases-field-remove");
		const hint = row.createDiv({ cls: "improved-bases-field-hint" });
		const conflict = row.createDiv({ cls: "improved-bases-field-hint improved-bases-field-conflict" });
		const editor = row.createDiv({ cls: "improved-bases-field-editor" });

		const refresh = (): void => {
			const open = expandable(draft) && this.expanded.has(draft);
			disclosure.disabled = !expandable(draft);
			disclosure.toggleClass("is-open", open);
			setIcon(typeIconEl, typeIcon(draft));
			this.renderDetails(details, draft);
			this.updateHint(hint, draft);
			this.updateConflict(conflict, draft);
			row.toggleClass("has-warning", !hint.hidden || !conflict.hidden);
			row.toggleClass("is-expanded", open);
			editor.hidden = !open;
			if (!open) editor.empty();
			else if (!editor.hasChildNodes()) this.renderEditor(editor, draft, refresh);
			this.updateStatus();
		};

		disclosure.addEventListener("click", () => {
			if (this.expanded.has(draft)) this.expanded.delete(draft);
			else this.expanded.add(draft);
			refresh();
		});
		name.addEventListener("input", () => {
			draft.name = name.value;
			refresh();
		});
		type.addEventListener("change", () => {
			draft.type = type.value as DraftType;
			if (expandable(draft)) this.expanded.add(draft);
			editor.empty();
			refresh();
		});
		trash.addEventListener("click", () => this.requestRemoval(row, draft));
		if (this.focusNext === draft) {
			this.focusNext = null;
			window.setTimeout(() => name.focus(), 0);
		}
		refresh();
	}

	/** Details column: option colors and count, relation target and cardinality, or a dash for native fields. */
	private renderDetails(el: HTMLElement, draft: FieldDraft): void {
		el.empty();
		if (draft.type === "select") {
			for (const option of draft.options.slice(0, 3)) el.createSpan({ cls: "improved-bases-color-dot", attr: { "data-color": option.color } });
			el.createSpan({ text: plural(draft.options.length, "option") });
		} else if (draft.type === "relation") {
			if (draft.base) this.renderBaseIcon(el.createSpan({ cls: "improved-bases-details-icon" }), draft.base);
			el.createSpan({ cls: "improved-bases-details-target", text: draft.base ?? "No base chosen" });
		} else {
			el.createSpan({ cls: "improved-bases-details-muted", text: "—" });
			return;
		}
		if (draft.multiple) el.createEl("em", { cls: "improved-bases-details-tag", text: "Multiple" });
	}

	/** Advises about other bases defining this field differently; saving stays possible. */
	private updateConflict(hint: HTMLElement, draft: FieldDraft): void {
		this.setHint(hint, conflictHint(draft, this.input.otherDefinitions(draft.name)));
	}

	/** Warns that a renamed field is still referenced by filters or formulas. */
	private updateHint(hint: HTMLElement, draft: FieldDraft): void {
		const from = draft.originalName;
		const show = from !== null && draft.name !== from && referencesName(this.input.expressions, from);
		this.setHint(hint, show ? `Filters or formulas reference '${from}', update them manually after saving` : null);
	}

	private setHint(hint: HTMLElement, text: string | null): void {
		hint.empty();
		hint.hidden = text === null;
		if (text === null) return;
		setIcon(hint.createSpan({ cls: "improved-bases-warning-icon" }), "lucide-alert-triangle");
		hint.createSpan({ text });
	}

	/** The base's own icon (emoji or built-in icon name), else the generic base icon. */
	private renderBaseIcon(el: HTMLElement, path: string): void {
		const icon = this.input.baseIcon(path);
		el.empty();
		if (icon) renderIcon(el, icon);
		else setIcon(el, BASE_ICON);
	}

	/** Type-dependent detail panel; options stay in the draft when the type changes. */
	private renderEditor(el: HTMLElement, draft: FieldDraft, refresh: () => void): void {
		if (draft.type === "relation") {
			const target = el.createDiv({ cls: "improved-bases-editor-field" });
			target.createSpan({ text: "Related base" });
			const box = target.createDiv({ cls: "improved-bases-type-select improved-bases-base-select" });
			const icon = box.createSpan({ cls: "improved-bases-type-icon" });
			const select = box.createEl("select", { cls: "improved-bases-field-base", attr: { "aria-label": "Related base" } });
			if (!draft.base) select.createEl("option", { text: "Choose base", attr: { value: "", disabled: "" } });
			const paths = draft.base && !this.input.basePaths.includes(draft.base) ? [draft.base, ...this.input.basePaths] : this.input.basePaths;
			for (const path of paths) select.createEl("option", { text: path, attr: { value: path } });
			select.value = draft.base ?? "";
			setIcon(box.createSpan({ cls: "improved-bases-type-chevron" }), "lucide-chevron-down");
			const refreshIcon = (): void => {
				if (draft.base) this.renderBaseIcon(icon, draft.base);
				else {
					icon.empty();
					setIcon(icon, BASE_ICON);
				}
			};
			refreshIcon();
			select.addEventListener("change", () => {
				draft.base = select.value || undefined;
				select.querySelector('option[value=""]')?.remove();
				refreshIcon();
				refresh();
			});
		}
		if (draft.type === "select") this.renderOptions(el.createDiv({ cls: "improved-bases-options" }), draft, refresh);
		const toggle = el.createEl("label", { cls: "improved-bases-editor-field improved-bases-toggle" });
		toggle.createSpan({ text: "Allow multiple" });
		new ToggleComponent(toggle).setValue(draft.multiple).onChange((v) => {
			draft.multiple = v;
			refresh();
		}).toggleEl.addClass("improved-bases-field-multiple");
	}

	private renderOptions(el: HTMLElement, draft: FieldDraft, refresh: () => void): void {
		el.empty();
		const rerender = (): void => {
			refresh();
			this.renderOptions(el, draft, refresh);
		};
		const list = el.createDiv({ cls: "improved-bases-option-list" });
		for (const option of draft.options) this.renderOption(list, draft, option, rerender);
		this.renderAddOption(el, list, draft, rerender);
	}

	/** "+ Option" turns into an input; Enter adds and keeps it open, an empty blur or Escape turns it back. */
	private renderAddOption(container: HTMLElement, list: HTMLElement, draft: FieldDraft, rerender: () => void): void {
		const button = list.createEl("button", { cls: "improved-bases-option-add-button", attr: { type: "button", "aria-label": "Add option" } });
		setIcon(button.createSpan(), "lucide-plus");
		button.createSpan({ text: "Option" });
		button.addEventListener("click", () => {
			const input = createEl("input", {
				cls: "improved-bases-option-new",
				attr: { type: "text", placeholder: "New option", "aria-label": "New option" },
			});
			const submit = (): void => {
				const value = input.value.trim();
				if (!value) return;
				draft.options.push({ value, color: "grey" });
				rerender();
				container.querySelector<HTMLElement>(".improved-bases-option-add-button")?.click();
			};
			input.addEventListener("keydown", (evt) => {
				if (evt.isComposing) return;
				if (evt.key === "Escape") {
					evt.preventDefault();
					input.replaceWith(button);
				} else if (evt.key === "Enter") {
					evt.preventDefault();
					submit();
				}
			});
			input.addEventListener("blur", () => {
				if (input.value.trim()) submit();
				else if (input.isConnected) input.replaceWith(button);
			});
			button.replaceWith(input);
			input.focus();
		});
	}

	/** A chip with the color dot and the value; a click opens the menu with rename, remove and the colors. */
	private renderOption(list: HTMLElement, draft: FieldDraft, option: OptionDraft, rerender: () => void): void {
		const chip = list.createEl("button", { cls: "improved-bases-option-chip", attr: { type: "button", "aria-label": `Edit option ${option.value}`, "data-color": option.color } });
		chip.createSpan({ cls: "improved-bases-color-dot" });
		chip.createSpan({ cls: "improved-bases-option-value", text: option.value });
		const rename = (): void => {
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
			chip.replaceWith(input);
			input.focus();
			input.select();
		};
		chip.addEventListener("click", (evt) => {
			openOptionEditMenu(evt, option.color, {
				onRename: rename,
				onRemove: () => {
					draft.options.remove(option);
					rerender();
				},
				onColor: (color) => {
					option.color = color;
					rerender();
				},
			}, this.input.overlays);
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
			await this.handlers.onSave(this.drafts, this.addView, this.icon.trim());
		} catch (e) {
			button.setDisabled(false);
			this.errorEl?.setText(errorText(e));
			return;
		}
		this.close();
	}
}
