import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { SchemaSettingsModal, type SchemaSettingsInput } from "../src/commands/SchemaSettingsModal";
import type { FieldDraft } from "../src/commands/schemaDraft";
import { OverlayRegistry } from "../src/widgets/types";

const d = (p: Partial<FieldDraft>): FieldDraft => ({
	originalName: null, originalBase: null, name: "X", type: "native", nativeLabel: null,
	pinned: null, hadCustomization: false, removed: false, multiple: false, options: [], ...p,
});
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

type OpenOpts = Partial<SchemaSettingsInput> & { countAffected?: (name: string) => Promise<number> };

function open(state: SchemaSettingsInput["state"], { countAffected: count, ...opts }: OpenOpts = {}) {
	const onSave = vi.fn((_drafts: FieldDraft[], _addView: number) => Promise.resolve());
	const onReset = vi.fn(() => Promise.resolve());
	const countAffected = vi.fn(count ?? (() => Promise.resolve(0)));
	const input: SchemaSettingsInput = {
		basePath: "Teams/Mitarbeiter.base",
		state,
		propertyNames: ["Role"],
		basePaths: ["Teams.base"],
		overlays: new OverlayRegistry(),
		membersKnown: () => true,
		views: ["A"],
		defaultViewIndex: 0,
		expressions: [],
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
});

describe("SchemaSettingsModal", () => {
	it("summarises fields and expands a row into the editor", () => {
		const { modal, el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Lead", type: "relation", base: "Teams.base", multiple: true }),
				d({ name: "Status", type: "select", multiple: true, options: [{ value: "A", color: "red" }] }),
				d({ name: " ", nativeLabel: "text" }),
			],
		});
		expect(modal.titleEl.textContent).toBe("Schema settings – Mitarbeiter");
		const rows = Array.from(el.querySelectorAll(".improved-bases-field-summary-text")).map((r) => r.textContent);
		expect(rows).toEqual(["Lead · relation · Teams.base · multiple", "Status · select · 1 options · multiple", "Unnamed field · native (text)"]);
		expect(el.querySelector(".improved-bases-field-editor")).toBeNull();
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(q(".improved-bases-field-base").textContent).toBe("Teams.base");
		expect(el.querySelector(".improved-bases-field-multiple")).not.toBeNull();
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(el.querySelector(".improved-bases-field-editor")).toBeNull();
	});

	it("re-renders the body when the type changes and keeps options", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [{ value: "A", color: "red" }] })] });
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(el.querySelectorAll(".improved-bases-pill")).toHaveLength(1);
		const type = q<HTMLSelectElement>(".improved-bases-field-type");
		type.value = "native";
		type.dispatchEvent(new Event("change"));
		expect(el.querySelector(".improved-bases-pill")).toBeNull();
		expect(el.querySelector(".improved-bases-field-multiple")).toBeNull();
		type.value = "relation";
		type.dispatchEvent(new Event("change"));
		expect(q(".improved-bases-field-base").textContent).toBe("Choose base");
		type.value = "select";
		type.dispatchEvent(new Event("change"));
		expect(el.querySelectorAll(".improved-bases-pill")).toHaveLength(1);
	});

	it("edits options: add, rename, remove, and toggles multiple", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "S", type: "select", options: [{ value: "A", color: "red" }] })] });
		q<HTMLElement>(".improved-bases-field-summary").click();
		const input = q<HTMLInputElement>(".improved-bases-option-new");
		input.value = " B ";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.textContent)).toEqual(["A", "B"]);
		q<HTMLElement>(".improved-bases-option-edit").click();
		const rename = q<HTMLInputElement>(".improved-bases-option-input");
		rename.value = "AA";
		rename.dispatchEvent(new Event("blur"));
		expect(Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.textContent)).toEqual(["AA", "B"]);
		q<HTMLElement>(".improved-bases-option-remove").click();
		expect(Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.textContent)).toEqual(["B"]);
		q<HTMLElement>(".improved-bases-field-multiple").click();
		expect(q(".improved-bases-field-summary-text").textContent).toBe("S · select · 1 options · multiple");
	});

	it("adds and removes fields", () => {
		const { el, q } = open({ kind: "fields", drafts: [d({ name: "A" })] });
		q<HTMLElement>(".improved-bases-add-field").click();
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(2);
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = "B";
		name.dispatchEvent(new Event("input"));
		expect(Array.from(el.querySelectorAll(".improved-bases-field-summary-text")).map((r) => r.textContent)).toEqual(["A · native", "B · native"]);
		q<HTMLElement>(".improved-bases-field-remove").click();
		expect(el.querySelectorAll(".improved-bases-field-row")).toHaveLength(1);
	});

	it("shows validation errors and refuses renames while members are unknown", async () => {
		const { q, onSave, error } = open({ kind: "fields", drafts: [d({ originalName: "A", name: "A" }), d({ name: "" })] }, { membersKnown: () => false });
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toBe("Field name is empty");
		expect(onSave).not.toHaveBeenCalled();
		q<HTMLElement>(".improved-bases-field-row:nth-child(2) .improved-bases-field-remove").click();
		q<HTMLElement>(".improved-bases-field-summary").click();
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
		q<HTMLElement>(".improved-bases-field-summary").click();
		const name = q<HTMLInputElement>(".improved-bases-field-name");
		name.value = " B ";
		name.dispatchEvent(new Event("input"));
		onSave.mockRejectedValueOnce(new Error("disk full"));
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ originalName: "A", name: "B" })], 0);
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
		expect(Array.from(el.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Cancel"]);
	});

	it("shows the view dropdown only for several views and passes the choice to save", async () => {
		const one = open({ kind: "fields", drafts: [] }, { views: ["A"] });
		expect(one.el.querySelector(".improved-bases-add-view")).toBeNull();
		const two = open({ kind: "fields", drafts: [] }, { views: ["A", "B"], defaultViewIndex: 1 });
		const sel = two.q<HTMLSelectElement>(".improved-bases-add-view");
		expect(sel.value).toBe("1");
		two.q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(two.onSave).toHaveBeenCalledWith([], 1);
		const three = open({ kind: "fields", drafts: [] }, { views: ["A", "B", "C"] });
		const pick = three.q<HTMLSelectElement>(".improved-bases-add-view");
		pick.value = "2";
		pick.dispatchEvent(new Event("change"));
		three.q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(three.onSave).toHaveBeenCalledWith([], 2);
	});

	it("summarises native fields with their label and pin", () => {
		const { el, q } = open({
			kind: "fields",
			drafts: [
				d({ name: "Status", nativeLabel: "text" }),
				d({ name: "Tags" }),
				d({ name: "Alpha", nativeLabel: "text", pinned: { type: "text" } }),
				d({ name: "Beta", pinned: { type: "number" } }),
			],
		});
		const rows = Array.from(el.querySelectorAll(".improved-bases-field-summary-text")).map((r) => r.textContent);
		expect(rows).toEqual(["Status · native (text)", "Tags · native", "Alpha · native (text, pinned)", "Beta · native (number, pinned)"]);
		q<HTMLElement>(".improved-bases-field-summary").click();
		const labels = Array.from(q<HTMLSelectElement>(".improved-bases-field-type").options).map((o) => o.textContent);
		expect(labels).toEqual(["native (text)", "relation", "select"]);
		expect(q(".improved-bases-field-editor").querySelectorAll(".setting-item")).toHaveLength(2);
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
		expect(el.querySelector(".improved-bases-field-chevron")).toBeNull();
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
		expect(q(".improved-bases-field-summary-text").textContent).toBe("S · native");
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

	it("hints when a renamed field is referenced by expressions", () => {
		const { q } = open({ kind: "fields", drafts: [d({ originalName: "Status", name: "Status" })] }, { expressions: ['Status != "a"'] });
		q<HTMLElement>(".improved-bases-field-summary").click();
		expect(q(".improved-bases-field-hint").textContent).toBe("");
		const input = q<HTMLInputElement>(".improved-bases-field-name");
		input.value = "Stand";
		input.dispatchEvent(new Event("input"));
		expect(q(".improved-bases-field-hint").textContent).toMatch(/Filters or formulas reference 'Status'/);
		input.value = "Status";
		input.dispatchEvent(new Event("input"));
		expect(q(".improved-bases-field-hint").textContent).toBe("");
	});

	it("passes removed drafts to save", async () => {
		const { q, onSave } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "", removed: true }), d({ originalName: "T", name: "T" })] });
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ originalName: "S", removed: true }), expect.objectContaining({ originalName: "T" })], 0);
	});

	it("refuses removals while members are unknown on save", async () => {
		const { q, onSave, error } = open({ kind: "fields", drafts: [d({ originalName: "S", name: "S", removed: true })] }, { membersKnown: () => false });
		q<HTMLElement>(".improved-bases-save").click();
		await tick();
		expect(error()).toMatch(/still loading/);
		expect(onSave).not.toHaveBeenCalled();
	});
});
