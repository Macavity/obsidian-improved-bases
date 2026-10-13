import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { SchemaSettingsModal, type SchemaSettingsInput } from "../src/schema-settings/SchemaSettingsModal";
import type { FieldDraft, OptionDraft } from "../src/schema-settings/schemaDraft";
import { confirmOptionDelete } from "../src/widgets/OptionDeleteModal";
import { OverlayRegistry } from "../src/widgets/types";
import { openOptionEditMenu } from "../src/widgets/pickers";
import { nextOptionColor } from "../src/widgets/values";
import type { Color } from "../src/schema/types";
import type { PropertyType } from "../src/internals/typeRegistry";

vi.mock("../src/widgets/pickers", () => ({ openOptionEditMenu: vi.fn() }));
vi.mock("../src/widgets/OptionDeleteModal", () => ({ confirmOptionDelete: vi.fn() }));
type ChipHandlers = { onRename: () => void; onRemove: () => void; onColor: (c: Color) => void };
const lastMenu = () => vi.mocked(openOptionEditMenu).mock.calls.at(-1)?.[2] as ChipHandlers;
const chips = (el: HTMLElement) => Array.from(el.querySelectorAll(".improved-bases-option-chip")).map((p) => p.textContent);

const types: PropertyType[] = [
	{ type: "text", name: "Text", icon: "lucide-text", reserved: false },
	{ type: "multitext", name: "Liste", icon: "lucide-list", reserved: false },
	{ type: "number", name: "Zahl", icon: "lucide-binary", reserved: false, validate: (v) => typeof v === "number" },
	{ type: "tags", name: "Tags", icon: "lucide-tags", reserved: true },
];
const d = (p: Partial<FieldDraft>): FieldDraft => ({
	originalName: null, originalBase: null, name: "X", type: "native", detected: null,
	override: null, removed: false, multiple: false, options: [], ...p,
});
const opt = (value: string, color: Color, p: Partial<OptionDraft> = {}): OptionDraft => ({ value, color, original: null, removal: null, ...p });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const names = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>(".improved-bases-field-name")).map((i) => i.value);
const details = (el: HTMLElement) => Array.from(el.querySelectorAll(".improved-bases-field-details")).map((x) => x.textContent);
const expanded = (el: HTMLElement) => Array.from(el.querySelectorAll(".improved-bases-field-row")).map((r) => r.classList.contains("is-expanded"));

type OpenOpts = Partial<SchemaSettingsInput> & { countAffected?: (name: string) => Promise<number> };

function open(state: SchemaSettingsInput["state"], { countAffected: count, ...opts }: OpenOpts = {}) {
	const onSave = vi.fn((_drafts: FieldDraft[], _addView: number) => Promise.resolve());
	const onReset = vi.fn(() => Promise.resolve());
	const countAffected = vi.fn(count ?? (() => Promise.resolve(0)));
	const input: SchemaSettingsInput = {
		basePath: "Teams/Mitarbeiter.base",
		state,
		icon: "",
		basePaths: ["Teams.base", "Other.base"],
		baseIcon: (path: string) => (path === "Teams.base" ? "👥" : null),
		overlays: new OverlayRegistry(),
		membersKnown: () => true,
		views: ["A"],
		defaultViewIndex: 0,
		expressions: [],
		otherDefinitions: () => [],
		memberValues: () => [],
		types,
		...opts,
	};
	const modal = new SchemaSettingsModal({} as App, input, { onSave, onReset, countAffected });
	modal.open();
	const el = modal.contentEl;
	const q = <T extends Element>(sel: string): T => {
		const found = el.querySelector<T>(sel);
		if (!found) throw new Error(`missing ${sel}`);
		return found;
	};
	const error = () => q(".improved-bases-form-error").textContent;
	return { modal, el, q, onSave, onReset, countAffected, error };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(openOptionEditMenu).mockClear();
	vi.mocked(confirmOptionDelete).mockReset();
});

describe("SchemaSettingsModal", () => {
	const suggestions = (el: HTMLElement) => Array.from(el.querySelectorAll(".improved-bases-option-suggestion")).map((p) => p.textContent);
	it("suggests the values found in the notes as options, one by one or all at once", () => {
		const memberValues = vi.fn((name: string) => (name === "Status" ? ["Todo", ["Open", "Done"], "Open", 3] : []));
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "Status", type: "select", options: [opt("Open", "blue")] })] }, { memberValues });
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		expect(suggestions(el)).toEqual(["Done · 1", "Todo · 1"]);
		q<HTMLButtonElement>('.improved-bases-option-suggestion[aria-label="Add option Todo"]').click();
		expect(chips(el)).toEqual(["Open", "Todo"]);
		expect(suggestions(el)).toEqual(["Done · 1"]);
		expect(el.querySelector(".improved-bases-suggestions-all")).toBeNull();
		memberValues.mockReturnValue(["A", "B", "Done", "Open", "Todo"]);
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		expect(suggestions(el)).toEqual(["A · 1", "B · 1", "Done · 1"]);
		q<HTMLButtonElement>(".improved-bases-suggestions-all").click();
		expect(chips(el)).toEqual(["Open", "Todo", "A", "B", "Done"]);
		expect(el.querySelector(".improved-bases-option-suggestions")).toBeNull();
	});
	it("caps the suggestion chips at twelve while Add all adds every value", () => {
		const values = Array.from({ length: 15 }, (_, i) => `V${String(i).padStart(2, "0")}`);
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "Status", type: "select" })] }, { memberValues: () => values });
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		expect(suggestions(el)).toHaveLength(12);
		const all = q<HTMLButtonElement>(".improved-bases-suggestions-all");
		expect(all.textContent).toBe("Add all (15)");
		all.click();
		expect(chips(el)).toEqual(values);
	});
	it("gives a clicked suggestion the next palette color and removes the chip", () => {
		const options = [opt("Open", "blue")];
		const { el, q, onSave } = open({ kind: "fields", drafts: [d({ name: "Status", type: "select", options })] }, { memberValues: () => ["Todo", "Todo", "Open"] });
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		expect(suggestions(el)).toEqual(["Todo · 2"]);
		q<HTMLButtonElement>('.improved-bases-option-suggestion[aria-label="Add option Todo"]').click();
		expect(suggestions(el)).toEqual([]);
		q<HTMLButtonElement>(".improved-bases-save").click();
		expect(onSave.mock.calls[0]?.[0][0]?.options[1]).toEqual(opt("Todo", nextOptionColor(1)));
	});
	it("reads the suggestions of the original name for a renamed field", () => {
		const memberValues = vi.fn((_name: string) => ["a"]);
		const { el, q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "State", type: "select" })] }, { memberValues });
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		expect(memberValues).toHaveBeenCalledWith("Status");
		expect(memberValues).not.toHaveBeenCalledWith("State");
		expect(suggestions(el)).toEqual(["a · 1"]);
	});
	it("offers no Add all for a single suggestion", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "Status", type: "select" })] }, { memberValues: () => ["a"] });
		q<HTMLButtonElement>(".improved-bases-field-disclosure").click();
		expect(suggestions(el)).toEqual(["a · 1"]);
		expect(el.querySelector(".improved-bases-suggestions-all")).toBeNull();
	});
	it("shows the suggestions when a field is switched to select", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "Status", detected: "text" })] }, { memberValues: () => ["x"] });
		expect(el.querySelector(".improved-bases-option-suggestions")).toBeNull();
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		type.value = "select";
		type.dispatchEvent(new Event("change"));
		expect(suggestions(el)).toEqual(["x · 1"]);
	});
	it("shows one table row per field with name, type icon and details", () => {
		const { modal, el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Lead", type: "relation", base: "Teams.base", multiple: true }),
				d({ name: "Status", type: "select", multiple: true, options: [opt("A", "red"), opt("B", "blue")] }),
				d({ name: " ", detected: "text" }),
			],
		});
		expect(modal.titleEl.textContent).toBe("Schema settings – Mitarbeiter");
		expect(modal.modalEl.classList.contains("improved-bases-schema-modal")).toBe(true);
		expect(names(el)).toEqual(["Lead", "Status", " "]);
		expect(details(el)).toEqual(["👥Teams.baseMultiple", "2 optionsMultiple", "—"]);
		expect(Array.from(el.querySelectorAll(".improved-bases-color-dot")).map((x) => x.getAttribute("data-color"))).toEqual(["red", "blue"]);
		expect(Array.from(el.querySelectorAll(".improved-bases-type-icon")).map((x) => x.getAttribute("data-icon"))).toEqual(["lucide-link", "lucide-circle-dot", "lucide-text"]);
		expect(Array.from(el.querySelectorAll<HTMLButtonElement>(".improved-bases-field-disclosure")).map((x) => x.disabled)).toEqual([false, false, true]);
		expect(expanded(el)).toEqual([false, false, false]);
		q<HTMLElement>(".improved-bases-field-disclosure").click();
		expect(expanded(el)).toEqual([true, false, false]);
		expect(q<HTMLSelectElement>(".improved-bases-field-base").value).toBe("Teams.base");
		expect(q(".improved-bases-base-select .improved-bases-type-icon").textContent).toBe("👥");
		expect(el.querySelector(".improved-bases-field-multiple")).not.toBeNull();
		q<HTMLElement>(".improved-bases-field-disclosure").click();
		expect(expanded(el)).toEqual([false, false, false]);
	});

	it("filters the rows by the search text", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "Lead" }), d({ name: "Status" })] });
		const search = q<HTMLInputElement>(".improved-bases-search input");
		search.value = "sta";
		search.dispatchEvent(new Event("input"));
		expect(names(el)).toEqual(["Status"]);
		search.value = "zzz";
		search.dispatchEvent(new Event("input"));
		expect(names(el)).toEqual([]);
		expect(q(".improved-bases-field-empty").textContent).toBe("No field matches the search");
		search.value = "";
		search.dispatchEvent(new Event("input"));
		expect(names(el)).toEqual(["Lead", "Status"]);
	});

	it("reports pending renames and removals in the footer", async () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" }), d({ originalName: "B", name: "B" }), d({ originalName: "C", name: "C" })] }, { countAffected: () => Promise.resolve(1) });
		const status = () => q(".improved-bases-rename-status").textContent;
		expect(status()).toMatch(/written to the base on Save/);
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = "AA";
		name.dispatchEvent(new Event("input"));
		expect(status()).toBe("11 pending renameA → AA");
		const second = el.querySelectorAll<HTMLInputElement>(".improved-bases-field-name")[1];
		if (!second) throw new Error("missing second name");
		second.value = "BB";
		second.dispatchEvent(new Event("input"));
		el.querySelectorAll<HTMLElement>(".improved-bases-field-remove")[2]?.click();
		await tick();
		q<HTMLElement>(".improved-bases-confirm-remove").click();
		expect(status()).toBe("32 pending renames, 1 removalA → AA · B → BB · +1 more");
		name.value = " ";
		name.dispatchEvent(new Event("input"));
		expect(status()).toBe("21 pending rename, 1 removalB → BB · C removed");
	});

	it("re-renders the body when the type changes and keeps options", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [opt("A", "red")] })] });
		q<HTMLElement>(".improved-bases-field-disclosure").click();
		expect(el.querySelectorAll(".improved-bases-option-chip")).toHaveLength(1);
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		type.value = "native";
		type.dispatchEvent(new Event("change"));
		expect(el.querySelector(".improved-bases-option-chip")).toBeNull();
		expect(el.querySelector(".improved-bases-field-multiple")).toBeNull();
		expect(expanded(el)).toEqual([false]);
		expect(details(el)).toEqual(["—"]);
		// Switching to a plugin type opens the details.
		type.value = "relation";
		type.dispatchEvent(new Event("change"));
		expect(expanded(el)).toEqual([true]);
		const base = q<HTMLSelectElement>(".improved-bases-field-base");
		expect(base.value).toBe("");
		expect(Array.from(base.options).map((o) => o.textContent)).toEqual(["Choose base", "Teams.base", "Other.base"]);
		expect(q(".improved-bases-base-select .improved-bases-type-icon").getAttribute("data-icon")).toBe("lucide-layout-list");
		expect(details(el)).toEqual(["No base chosen"]);
		base.value = "Teams.base";
		base.dispatchEvent(new Event("change"));
		expect(q(".improved-bases-base-select .improved-bases-type-icon").textContent).toBe("👥");
		expect(Array.from(base.options).map((o) => o.textContent)).toEqual(["Teams.base", "Other.base"]);
		expect(details(el)).toEqual(["👥Teams.base"]);
		base.value = "Other.base";
		base.dispatchEvent(new Event("change"));
		expect(q(".improved-bases-base-select .improved-bases-type-icon").getAttribute("data-icon")).toBe("lucide-layout-list");
		expect(details(el)).toEqual(["Other.base"]);
		type.value = "select";
		type.dispatchEvent(new Event("change"));
		expect(el.querySelectorAll(".improved-bases-option-chip")).toHaveLength(1);
	});

	it("edits options: add, rename, recolor, remove, and toggles multiple", async () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [opt("A", "red")] })] });
		q<HTMLElement>(".improved-bases-field-disclosure").click();
		expect(el.querySelector(".improved-bases-option-new")).toBeNull();
		q<HTMLElement>(".improved-bases-option-add-button").click();
		const input = q<HTMLInputElement>(".improved-bases-option-new");
		input.value = " B ";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		// The browser blurs the input when the rerender detaches it; that must not add the option twice.
		input.dispatchEvent(new Event("blur"));
		expect(chips(el)).toEqual(["A", "B"]);
		// Enter keeps the input open for the next option; Escape turns it back into the button.
		const next = q<HTMLInputElement>(".improved-bases-option-new");
		next.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(el.querySelector(".improved-bases-option-new")).toBeNull();
		expect(el.querySelector(".improved-bases-option-add-button")).not.toBeNull();
		q<HTMLElement>(".improved-bases-option-chip").click();
		expect(vi.mocked(openOptionEditMenu).mock.calls.at(-1)?.[1]).toBe("red");
		lastMenu().onRename();
		const rename = q<HTMLInputElement>(".improved-bases-option-input");
		rename.value = "AA";
		rename.dispatchEvent(new Event("blur"));
		expect(chips(el)).toEqual(["AA", "B"]);
		q<HTMLElement>(".improved-bases-option-chip").click();
		lastMenu().onColor("blue");
		expect(q(".improved-bases-option-chip").getAttribute("data-color")).toBe("blue");
		q<HTMLElement>(".improved-bases-option-chip").click();
		lastMenu().onRemove();
		await tick();
		expect(chips(el)).toEqual(["B"]);
		expect(details(el)).toEqual(["1 option"]);
		q<HTMLElement>(".improved-bases-field-multiple").click();
		expect(details(el)).toEqual(["1 optionMultiple"]);
	});

	it("adds and removes fields", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "A" })] });
		q<HTMLElement>(".improved-bases-add-field").click();
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(2);
		const name = q<HTMLInputElement>(".improved-bases-field-row:nth-child(2) .improved-bases-field-name");
		name.value = "B";
		name.dispatchEvent(new Event("input"));
		expect(names(el)).toEqual(["A", "B"]);
		q<HTMLElement>(".improved-bases-field-row:nth-child(2) .improved-bases-field-remove").click();
		expect(names(el)).toEqual(["A"]);
	});

	it("clears the search when a field is added so the new row is visible", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "A" })] });
		const search = q<HTMLInputElement>(".improved-bases-search input");
		search.value = "zzz";
		search.dispatchEvent(new Event("input"));
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(0);
		q<HTMLElement>(".improved-bases-add-field").click();
		expect(search.value).toBe("");
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(2);
	});

	it("shows validation errors and refuses renames while members are unknown", async () => {
		const { q, onSave, error } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" }), d({ name: "" })] }, { membersKnown: () => false });
		const second = q<HTMLInputElement>(".improved-bases-field-row:nth-child(2) .improved-bases-field-name");
		second.value = " ";
		second.dispatchEvent(new Event("input"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toBe("Field name is empty");
		expect(onSave).not.toHaveBeenCalled();
		q<HTMLElement>(".improved-bases-field-row:nth-child(2) .improved-bases-field-remove").click();
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = " B ";
		name.dispatchEvent(new Event("input"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toMatch(/still loading/);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("saves trimmed drafts and closes, or shows the handler error", async () => {
		const { modal, q, onSave, error } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" })] });
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = " B ";
		name.dispatchEvent(new Event("input"));
		onSave.mockRejectedValueOnce(new Error("disk full"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ originalName: "A", name: "B" })], 0, "");
		expect(error()).toBe("disk full");
		expect(q<HTMLButtonElement>(".improved-bases-save").disabled).toBe(false);
		expect(document.body.contains(modal.modalEl)).toBe(true);
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(document.body.contains(modal.modalEl)).toBe(false);
	});

	it("resets a broken schema after confirmation", async () => {
		const { modal, q, onReset, error } = open({ kind: "error", message: "bad yaml", resettable: true });
		expect(q(".improved-bases-schema-error").textContent).toBe("bad yaml");
		const reset = q<HTMLButtonElement>(".improved-bases-reset");
		reset.click();
		expect(reset.textContent).toBe("Confirm reset");
		expect(onReset).not.toHaveBeenCalled();
		onReset.mockRejectedValueOnce(new Error("locked"));
		reset.click();
		await tick();
		expect(error()).toBe("locked");
		reset.click();
		await tick();
		expect(onReset).toHaveBeenCalledTimes(2);
		expect(document.body.contains(modal.modalEl)).toBe(false);
	});

	it("shows no reset button for a non-resettable error", () => {
		const { el } = open({ kind: "error", message: "bad yaml", resettable: false });
		expect(el.querySelector(".improved-bases-reset")).toBeNull();
		expect(Array.from(el.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Close"]);
	});

	it("offers Close until something changed, then Cancel and Save", () => {
		const { el, q, modal } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" })] });
		const buttons = () => Array.from(el.querySelectorAll(".improved-bases-footer-buttons button")).map((b) => b.textContent);
		expect(buttons()).toEqual(["Close"]);
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = "B";
		name.dispatchEvent(new Event("input"));
		expect(buttons()).toEqual(["Cancel", "Save"]);
		name.value = "A";
		name.dispatchEvent(new Event("input"));
		expect(buttons()).toEqual(["Close"]);
		const icon = modal.modalEl.querySelector<HTMLInputElement>(".improved-bases-base-icon-input");
		if (!icon) throw new Error("missing icon input");
		icon.value = " 👤 ";
		icon.dispatchEvent(new Event("input"));
		expect(buttons()).toEqual(["Cancel", "Save"]);
		icon.value = "";
		icon.dispatchEvent(new Event("input"));
		expect(buttons()).toEqual(["Close"]);
		q<HTMLElement>(".improved-bases-close").click();
		expect(document.body.contains(modal.modalEl)).toBe(false);
	});

	it("shows the view dropdown only for several views and passes the choice to save", async () => {
		const one = open({ kind: "fields", drafts: [] }, { views: ["A"] });
		expect(one.el.querySelector(".improved-bases-add-view")).toBeNull();
		const two = open({ kind: "fields", drafts: [] }, { views: ["A", "B"], defaultViewIndex: 1 });
		const sel = two.q<HTMLSelectElement>(".improved-bases-add-view");
		expect(sel.value).toBe("1");
		two.q<HTMLElement>(".improved-bases-add-field").click();
		two.q<HTMLInputElement>(".improved-bases-field-name").value = "N";
		two.q<HTMLInputElement>(".improved-bases-field-name").dispatchEvent(new Event("input"));
		two.q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(two.onSave).toHaveBeenCalledWith([expect.objectContaining({ name: "N" })], 1, "");
		const three = open({ kind: "fields", drafts: [] }, { views: ["A", "B", "C"] });
		const pick = three.q<HTMLSelectElement>(".improved-bases-add-view");
		pick.value = "2";
		pick.dispatchEvent(new Event("change"));
		three.q<HTMLElement>(".improved-bases-add-field").click();
		three.q<HTMLInputElement>(".improved-bases-field-name").value = "N";
		three.q<HTMLInputElement>(".improved-bases-field-name").dispatchEvent(new Event("input"));
		three.q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(three.onSave).toHaveBeenCalledWith([expect.objectContaining({ name: "N" })], 2, "");
	});

	it("labels and lists native types from the registry", () => {
		const { el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Team", detected: "multitext" }),
				d({ name: "Tags", detected: "tags" }),
				d({ name: "Old", detected: "text", override: { type: "list" } }),
				d({ name: "Beta", detected: "text", override: { type: "number" } }),
				d({ name: "None", detected: null }),
			],
		});
		const selects = Array.from(el.querySelectorAll<HTMLSelectElement>(".improved-bases-field-type"));
		expect(selects.map((s) => s.selectedOptions[0]?.textContent)).toEqual(["Liste", "Tags", "list (not registered)", "Zahl", "Native"]);
		expect(details(el)).toEqual(["—", "—", "Type override", "Type override", "—"]);
		const all = ["Text", "Liste", "Zahl", "Relation", "Select"];
		expect(Array.from(q<HTMLSelectElement>(".improved-bases-field-type").options).map((o) => o.textContent)).toEqual(all);
		expect(Array.from(selects[1]?.options ?? []).map((o) => o.textContent)).toEqual(["Tags", ...all]);
		expect(Array.from(selects[2]?.options ?? []).map((o) => o.textContent)).toEqual(["Text", "Liste", "Zahl", "list (not registered)", "Relation", "Select"]);
		expect(Array.from(el.querySelectorAll(".improved-bases-type-icon")).map((x) => x.getAttribute("data-icon"))).toEqual(["lucide-list", "lucide-tags", "lucide-text", "lucide-binary", "lucide-text"]);
	});

	it("overrides the type from the dropdown and drops the override for Obsidian's own", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "G", detected: "text", override: { type: "number" } })] });
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		expect(type.value).toBe("native:number");
		const icon = () => q(".improved-bases-type-icon").getAttribute("data-icon");
		expect(icon()).toBe("lucide-binary");
		type.value = "native:multitext";
		type.dispatchEvent(new Event("change"));
		expect(icon()).toBe("lucide-list");
		expect(details(el)).toEqual(["Type override"]);
		expect(q<HTMLButtonElement>(".improved-bases-field-disclosure").disabled).toBe(true);
		type.value = "native:text";
		type.dispatchEvent(new Event("change"));
		expect(icon()).toBe("lucide-text");
		expect(details(el)).toEqual(["—"]);
	});

	it("warns when member values do not fit the chosen type, without blocking save", () => {
		const values = ["Aktiv", "Urlaub", "Aktiv", "Urlaub", "Aktiv"];
		const memberValues = vi.fn((name: string) => (name === "Status" ? values : []));
		const { el, q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status", detected: "text" })] }, { memberValues });
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		const warning = () => q<HTMLElement>(".improved-bases-field-mismatch");
		const row = () => q(".improved-bases-field-row");
		expect(warning().hidden).toBe(true);
		expect(row().classList.contains("has-warning")).toBe(false);
		type.value = "native:number";
		type.dispatchEvent(new Event("change"));
		expect(warning().hidden).toBe(false);
		expect(warning().textContent).toBe("5 notes have a Status that is not a valid Zahl; they keep their value and show as Text");
		expect(row().classList.contains("has-warning")).toBe(true);
		expect(q<HTMLButtonElement>(".improved-bases-save").disabled).toBe(false);
		for (const back of ["native:text", "select"]) {
			type.value = "native:number";
			type.dispatchEvent(new Event("change"));
			type.value = back;
			type.dispatchEvent(new Event("change"));
			expect(warning().hidden).toBe(true);
		}
		expect(el.querySelectorAll(".improved-bases-field-mismatch")).toHaveLength(1);
	});

	it("warns in the remove confirmation when expressions reference the field", async () => {
		const { q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status" })] }, { expressions: ['Status != "a"'], countAffected: () => Promise.resolve(2) });
		q<HTMLElement>(".improved-bases-field-remove").click();
		expect(q(".improved-bases-field-confirm").textContent).toMatch(/from the notes\? Filters or formulas reference it\./);
		await tick();
		expect(q(".improved-bases-field-confirm").textContent).toMatch(/from 2 notes\? Filters or formulas reference it\./);
	});

	it("does not warn in the remove confirmation without references", async () => {
		const { q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status" })] }, { expressions: ['Other != "a"'] });
		q<HTMLElement>(".improved-bases-field-remove").click();
		await tick();
		expect(q(".improved-bases-field-confirm").textContent).not.toMatch(/reference/);
	});

	describe("removing a saved option", () => {
		const saved = (memberValues: (name: string) => unknown[]) => {
			const t = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status", type: "select", options: [opt("Open", "red", { original: "Open" }), opt("Done", "blue", { original: "Done" })] })] }, { memberValues });
			t.q<HTMLElement>(".improved-bases-field-disclosure").click();
			const remove = async (index: number) => {
				t.el.querySelectorAll<HTMLElement>(".improved-bases-option-chip")[index]?.click();
				lastMenu().onRemove();
				await tick();
			};
			const status = () => t.q(".improved-bases-rename-status").textContent;
			return { ...t, remove, status };
		};
		it("asks what to do with the notes and shows a removal from the notes as pending", async () => {
			vi.mocked(confirmOptionDelete).mockResolvedValue("notes");
			const t = saved((name) => (name === "Status" ? ["Open", ["Open", "Done"], "Done"] : []));
			await t.remove(0);
			expect(confirmOptionDelete).toHaveBeenCalledWith(expect.anything(), "Open", 2, expect.anything());
			expect(chips(t.el)).toEqual(["Done"]);
			expect(details(t.el)).toEqual(["1 option"]);
			expect(t.status()).toBe("11 option removalStatus: Open removed");
			t.q<HTMLElement>(".improved-bases-save").click();
			await tick();
			expect(t.onSave.mock.calls[0]?.[0][0]?.options[0]).toEqual(opt("Open", "red", { original: "Open", removal: "notes" }));
		});
		it("keeps the option when the dialog is cancelled", async () => {
			vi.mocked(confirmOptionDelete).mockResolvedValue(null);
			const t = saved(() => ["Open"]);
			await t.remove(0);
			expect(chips(t.el)).toEqual(["Open", "Done"]);
		});
		it("drops an unused option from the schema without asking", async () => {
			const t = saved(() => ["Open"]);
			await t.remove(1);
			expect(confirmOptionDelete).not.toHaveBeenCalled();
			expect(chips(t.el)).toEqual(["Open"]);
			expect(t.status()).toMatch(/written to the base on Save/);
		});
		it("shows an option rename as pending and refuses to save it while members are unknown", async () => {
			const t = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status", type: "select", options: [opt("Open", "red", { original: "Open" })] })] }, { membersKnown: () => false });
			t.q<HTMLElement>(".improved-bases-field-disclosure").click();
			t.q<HTMLElement>(".improved-bases-option-chip").click();
			lastMenu().onRename();
			const input = t.q<HTMLInputElement>(".improved-bases-option-input");
			input.value = "Offen";
			input.dispatchEvent(new Event("blur"));
			expect(t.q(".improved-bases-rename-status").textContent).toBe("11 pending option renameStatus: Open → Offen");
			t.q<HTMLElement>(".improved-bases-save").click();
			await tick();
			expect(t.error()).toMatch(/still loading/);
			expect(t.onSave).not.toHaveBeenCalled();
		});
	});

	it("passes removed drafts to save", async () => {
		const { q, onSave } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S" }), d({ originalName: "T", name: "T" })] }, { countAffected: () => Promise.resolve(1) });
		q<HTMLElement>(".improved-bases-field-remove").click();
		await tick();
		q<HTMLElement>(".improved-bases-confirm-remove").click();
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ originalName: "S", removed: true }), expect.objectContaining({ originalName: "T" })], 0, "");
	});

	it("refuses removals while members are unknown on save", async () => {
		const { q, onSave, error, modal } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S", removed: true })] }, { membersKnown: () => false });
		const icon = modal.modalEl.querySelector<HTMLInputElement>(".improved-bases-base-icon-input");
		if (!icon) throw new Error("missing icon input");
		icon.value = "x";
		icon.dispatchEvent(new Event("input"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toMatch(/still loading/);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("edits the base's default entry icon in the header and passes it trimmed to save", async () => {
		const { modal, q, onSave } = open({ kind: "fields", drafts: [d({ name: "Lead", type: "relation", base: "Teams.base" })] }, { icon: "👤" });
		const input = modal.modalEl.querySelector<HTMLInputElement>(".improved-bases-base-icon-input");
		if (!input) throw new Error("missing icon input");
		// Lives in the modal header next to the title, not in the content.
		expect(input.closest(".improved-bases-base-icon")?.parentElement).toBe(modal.titleEl.parentElement);
		expect(input.value).toBe("👤");
		expect(input.placeholder).toBe("📄");
		input.value = " 👥 ";
		input.dispatchEvent(new Event("input"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ name: "Lead" })], 0, "👥");
	});

	it("passes an empty icon to save when cleared", async () => {
		const { modal, q, onSave } = open({ kind: "fields", drafts: [] }, { icon: "👤" });
		const input = modal.modalEl.querySelector<HTMLInputElement>(".improved-bases-base-icon-input");
		if (!input) throw new Error("missing icon input");
		input.value = "";
		input.dispatchEvent(new Event("input"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([], 0, "");
	});
});
