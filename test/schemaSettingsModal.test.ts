import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { SchemaSettingsModal, type SchemaSettingsInput } from "../src/schema-settings/SchemaSettingsModal";
import type { FieldDraft } from "../src/schema-settings/schemaDraft";
import { OverlayRegistry } from "../src/widgets/types";
import { openOptionEditMenu } from "../src/widgets/pickers";
import type { Color } from "../src/schema/types";

vi.mock("../src/widgets/pickers", () => ({ openOptionEditMenu: vi.fn() }));
type ChipHandlers = { onRename: () => void; onRemove: () => void; onColor: (c: Color) => void };
const lastMenu = () => vi.mocked(openOptionEditMenu).mock.calls.at(-1)?.[2] as ChipHandlers;
const chips = (el: HTMLElement) => Array.from(el.querySelectorAll(".improved-bases-option-chip")).map((p) => p.textContent);

const d = (p: Partial<FieldDraft>): FieldDraft => ({
	originalName: null, originalBase: null, name: "X", type: "native", nativeLabel: null,
	pinned: null, removed: false, multiple: false, options: [], ...p,
});
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
});

describe("SchemaSettingsModal", () => {
	it("shows one table row per field with name, type icon and details", () => {
		const { modal, el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Lead", type: "relation", base: "Teams.base", multiple: true }),
				d({ name: "Status", type: "select", multiple: true, options: [{ value: "A", color: "red" }, { value: "B", color: "blue" }] }),
				d({ name: " ", nativeLabel: "text" }),
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
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [{ value: "A", color: "red" }] })] });
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

	it("edits options: add, rename, recolor, remove, and toggles multiple", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [{ value: "A", color: "red" }] })] });
		q<HTMLElement>(".improved-bases-field-disclosure").click();
		expect(el.querySelector(".improved-bases-option-new")).toBeNull();
		q<HTMLElement>(".improved-bases-option-add-button").click();
		const input = q<HTMLInputElement>(".improved-bases-option-new");
		input.value = " B ";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
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

	it("labels native fields with their type and pin", () => {
		const { el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Status", nativeLabel: "text" }),
				d({ name: "Tags" }),
				d({ name: "Alpha", nativeLabel: "text", pinned: { type: "text" } }),
				d({ name: "Beta", pinned: { type: "number" } }),
				d({ name: "Gamma", nativeLabel: "text", pinned: { type: "number" } }),
				d({ name: "Delta", pinned: { type: "list" } }),
			],
		});
		const selects = Array.from(el.querySelectorAll<HTMLSelectElement>(".improved-bases-field-type"));
		expect(selects.map((s) => s.selectedOptions[0]?.textContent)).toEqual(["Text", "Native", "Text", "Number", "Number", "List"]);
		expect(details(el)).toEqual(["—", "—", "Pinned", "Pinned", "Pinned", "Pinned"]);
		const all = ["Text", "List", "Number", "Checkbox", "Date", "Date & time", "Relation", "Select"];
		expect(Array.from(q<HTMLSelectElement>(".improved-bases-field-type").options).map((o) => o.textContent)).toEqual(all);
		expect(Array.from(selects[1]?.options ?? []).map((o) => o.textContent)).toEqual(["Native", ...all]);
		expect(Array.from(el.querySelectorAll(".improved-bases-type-icon")).map((x) => x.getAttribute("data-icon"))).toEqual(["lucide-text", "lucide-text", "lucide-text", "lucide-binary", "lucide-binary", "lucide-list"]);
		expect(q<HTMLButtonElement>(".improved-bases-field-disclosure").disabled).toBe(true);
	});

	it("asks before removing a known field and marks it removed", async () => {
		const countAffected = vi.fn(() => Promise.resolve(3));
		const { el, q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status" })] }, { countAffected });
		q<HTMLElement>(".improved-bases-field-remove").click();
		expect(countAffected).toHaveBeenCalledWith("Status");
		expect(q(".improved-bases-field-confirm").textContent).toMatch(/Remove 'Status' and its value from the notes\?/);
		expect(q(".improved-bases-confirm-remove").hasAttribute("disabled")).toBe(true);
		await tick();
		expect(q(".improved-bases-field-confirm").textContent).toMatch(/from 3 notes/);
		expect(q(".improved-bases-confirm-remove").hasAttribute("disabled")).toBe(false);
		q<HTMLElement>(".improved-bases-confirm-remove").click();
		expect(el.querySelector(".improved-bases-field-removed")).not.toBeNull();
		expect(el.querySelector(".improved-bases-field-remove")).toBeNull();
		expect(el.querySelector(".improved-bases-field-name")).toBeNull();
		expect(q(".improved-bases-field-removed-name").textContent).toBe("Status");
		q<HTMLElement>(".improved-bases-undo").click();
		expect(el.querySelector(".improved-bases-field-removed")).toBeNull();
		expect(el.querySelector(".improved-bases-field-remove")).not.toBeNull();
	});

	it("uses the singular for one affected note", async () => {
		const { q } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S" })] }, { countAffected: () => Promise.resolve(1) });
		q<HTMLElement>(".improved-bases-field-remove").click();
		await tick();
		expect(q(".improved-bases-field-confirm").textContent).toMatch(/from 1 note\?/);
	});

	it("keeps the field when the confirmation is declined", async () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S" })] }, { countAffected: () => Promise.resolve(2) });
		q<HTMLElement>(".improved-bases-field-remove").click();
		await tick();
		q<HTMLElement>(".improved-bases-confirm-keep").click();
		expect(el.querySelector(".improved-bases-field-confirm")).toBeNull();
		expect(el.querySelector(".improved-bases-field-removed")).toBeNull();
		expect(names(el)).toEqual(["S"]);
	});

	it("restores the row and shows the error when counting fails", async () => {
		const { el, q, error } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S" })] }, { countAffected: () => Promise.reject(new Error("io")) });
		q<HTMLElement>(".improved-bases-field-remove").click();
		await tick();
		expect(error()).toBe("io");
		expect(el.querySelector(".improved-bases-field-confirm")).toBeNull();
		expect(el.querySelector(".improved-bases-field-removed")).toBeNull();
	});

	it("ignores a count that arrives after the row was re-rendered", async () => {
		let resolve: (n: number) => void = () => undefined;
		const pending = new Promise<number>((r) => { resolve = r; });
		const { el, q } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S" })] }, { countAffected: () => pending });
		q<HTMLElement>(".improved-bases-field-remove").click();
		q<HTMLElement>(".improved-bases-confirm-keep").click();
		resolve(4);
		await tick();
		expect(el.textContent).not.toMatch(/4 notes/);
		expect(el.querySelector(".improved-bases-field-confirm")).toBeNull();
	});

	it("blocks removal while members are unknown", () => {
		const { el, q, error, countAffected } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S" })] }, { membersKnown: () => false });
		q<HTMLElement>(".improved-bases-field-remove").click();
		expect(error()).toMatch(/still loading/);
		expect(countAffected).not.toHaveBeenCalled();
		expect(el.querySelector(".improved-bases-field-confirm")).toBeNull();
	});

	it("shows conflicting definitions of other bases under the field and follows edits", () => {
		const otherDefinitions = vi.fn((name: string) => (name.toLowerCase() === "team" ? [{ basePath: "Meetings.base", field: { type: "text" as const }, shared: 1 }] : []));
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "Team", type: "relation", base: "Teams.base", multiple: true }), d({ name: "Role", type: "select" })] }, { otherDefinitions });
		const hints = () => Array.from(el.querySelectorAll<HTMLElement>(".improved-bases-field-conflict"));
		expect(hints()[0]?.textContent).toBe("Also defined in Meetings.base as text; 1 note is in both bases.");
		expect(hints().map((h) => h.hidden)).toEqual([false, true]);
		expect(Array.from(el.querySelectorAll(".improved-bases-field-row")).map((r) => r.classList.contains("has-warning"))).toEqual([true, false]);
		// Switching the type to native (unpinned) ends the conflict.
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		type.value = "native";
		type.dispatchEvent(new Event("change"));
		expect(hints().map((h) => h.hidden)).toEqual([true, true]);
		// Renaming the other field onto the conflicting name starts it there.
		const second = el.querySelectorAll<HTMLInputElement>(".improved-bases-field-name")[1];
		if (!second) throw new Error("missing second name");
		second.value = "team";
		second.dispatchEvent(new Event("input"));
		expect(hints().map((h) => h.hidden)).toEqual([true, false]);
	});
	it("hints when a renamed field is referenced by expressions", () => {
		const { q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status" })] }, { expressions: ['Status != "a"'] });
		expect(q<HTMLElement>(".improved-bases-field-hint").hidden).toBe(true);
		const input = q<HTMLInputElement>(".improved-bases-field-name");
		input.value = "Stand";
		input.dispatchEvent(new Event("input"));
		expect(q<HTMLElement>(".improved-bases-field-hint").hidden).toBe(false);
		expect(q(".improved-bases-field-hint").textContent).toMatch(/Filters or formulas reference 'Status'/);
		input.value = "Status";
		input.dispatchEvent(new Event("input"));
		expect(q<HTMLElement>(".improved-bases-field-hint").hidden).toBe(true);
	});

	it("pins a native type from the dropdown and unpins Obsidian's own", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "G", nativeLabel: "text", pinned: { type: "number" } })] });
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		expect(type.value).toBe("native:number");
		const icon = () => q(".improved-bases-type-icon").getAttribute("data-icon");
		expect(icon()).toBe("lucide-binary");
		type.value = "native:date";
		type.dispatchEvent(new Event("change"));
		expect(icon()).toBe("lucide-calendar");
		expect(details(el)).toEqual(["Pinned"]);
		expect(q<HTMLButtonElement>(".improved-bases-field-disclosure").disabled).toBe(true);
		type.value = "native:text";
		type.dispatchEvent(new Event("change"));
		expect(icon()).toBe("lucide-text");
		expect(details(el)).toEqual(["—"]);
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
