import { isColor, type BaseSchema, type Color, type FieldSchema } from "../schema/types";
import { findOwnKey, isUnsafeKey, setOption } from "../schema/keys";
import type { BaseColumns, ColumnEdits, RawFields } from "../schema/baseDoc";

/** Field kinds in the dialog: native (Obsidian's own type), or a plugin customization. */
export type DraftType = "native" | "relation" | "select";

/** All selectable field types. */
export const TYPES: readonly DraftType[] = ["native", "relation", "select"];

/** One select option while editing. */
export interface OptionDraft { value: string; color: Color }

/** Editable copy of a field; `originalName` is null for new fields, `originalBase` the saved relation target. */
export interface FieldDraft {
	originalName: string | null;
	originalBase: string | null;
	name: string;
	type: DraftType;
	/** Obsidian's type for this property ("text", "multitext", "tags", ...) or null. */
	nativeLabel: string | null;
	/** Hand-written native entry, written back unchanged. */
	pinned: Record<string, unknown> | null;
	/** The original schema entry was a relation or select. */
	hadCustomization: boolean;
	removed: boolean;
	multiple: boolean;
	base?: string;
	options: OptionDraft[];
}

export interface KnownFieldsInput {
	columns: BaseColumns;
	schemaFields: BaseSchema["fields"] | null;
	memberKeys: string[];
	nativeLabel: (name: string) => string | null;
	currentView: number;
}

/** Names in source order, deduplicated case-insensitively (first spelling wins). */
function collectNames(input: KnownFieldsInput, current: string[]): string[] {
	const { columns, schemaFields, memberKeys } = input;
	const seen = new Set<string>();
	const names: string[] = [];
	const add = (n: string): void => {
		const key = n.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		names.push(n);
	};
	current.forEach(add);
	columns.orderByView.forEach((order) => order.forEach(add));
	columns.configured.forEach(add);
	memberKeys.filter((k) => k !== "position").forEach(add);
	for (const { name } of schemaFields?.values() ?? []) add(name);
	return names;
}

function toDraft(name: string, field: FieldSchema | undefined, label: string | null): FieldDraft {
	const draft: FieldDraft = {
		originalName: name, originalBase: null, name, type: "native", nativeLabel: label,
		pinned: null, hadCustomization: false, removed: false, multiple: false, options: [],
	};
	if (!field) return draft;
	if (field.type === "relation") {
		Object.assign(draft, { type: "relation", base: field.base, originalBase: field.base, multiple: field.multiple, hadCustomization: true });
	} else if (field.type === "select") {
		Object.assign(draft, { type: "select", multiple: field.multiple, hadCustomization: true, options: field.options.map((o) => ({ value: o.value, color: o.color })) });
	} else {
		draft.pinned = { type: field.type };
	}
	return draft;
}

/** Every field the base knows, current view's order first, the rest alphabetical. */
export function knownFieldDrafts(input: KnownFieldsInput): FieldDraft[] {
	const current = input.columns.orderByView[input.currentView] ?? [];
	const names = collectNames(input, current);
	const lead = new Set(current.map((n) => n.toLowerCase()));
	const first = names.filter((n) => lead.has(n.toLowerCase()));
	const rest = names.filter((n) => !lead.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	return [...first, ...rest].map((n) => toDraft(n, input.schemaFields?.get(n.toLowerCase())?.field, input.nativeLabel(n)));
}

const isRenamed = (x: FieldDraft): boolean => !x.removed && x.originalName !== null && x.originalName.toLowerCase() !== x.name.toLowerCase();

/** Name errors for one draft; `seen` and `vacated` hold lowercased names of the whole list. */
function validateName(draft: FieldDraft, seen: Set<string>, vacated: Set<string>): string[] {
	const name = draft.name;
	const errors: string[] = [];
	if (name !== name.trim()) errors.push(`Field name '${name}' has surrounding whitespace`);
	if (isUnsafeKey(name)) errors.push(`Field name '${name}' is reserved`);
	const lower = name.toLowerCase();
	if (seen.has(lower)) errors.push(`Duplicate field '${name}'`);
	seen.add(lower);
	if (isRenamed(draft) && vacated.has(lower)) errors.push(`Field '${name}': another field is renamed from this name`);
	return errors;
}

function validateOptions(name: string, options: OptionDraft[]): string[] {
	const errors: string[] = [];
	const values = new Set<string>();
	for (const o of options) {
		if (!o.value.trim()) errors.push(`Field '${name}': option value is empty`);
		else if (isUnsafeKey(o.value)) errors.push(`Field '${name}': option '${o.value}' is reserved`);
		else if (values.has(o.value)) errors.push(`Field '${name}': duplicate option '${o.value}'`);
		values.add(o.value);
		if (!isColor(o.color)) errors.push(`Field '${name}': invalid color for option '${o.value}'`);
	}
	return errors;
}

/** Human-readable validation errors; empty when drafts are valid. */
export function validateDrafts(drafts: FieldDraft[], basePaths: string[]): string[] {
	const errors: string[] = [];
	const seen = new Set<string>();
	// Names other fields are renamed away from; renaming onto one would swap values between fields.
	const vacated = new Set(drafts.filter(isRenamed).map((x) => (x.originalName as string).toLowerCase()));
	for (const draft of drafts.filter((x) => !x.removed)) {
		const name = draft.name;
		if (!name.trim()) {
			errors.push("Field name is empty");
			continue;
		}
		errors.push(...validateName(draft, seen, vacated));
		if (!TYPES.includes(draft.type)) {
			errors.push(`Field '${name}': unknown type '${String(draft.type)}'`);
		} else if (draft.type === "relation" && !(draft.base && (basePaths.includes(draft.base) || draft.base === draft.originalBase))) {
			// A saved target stays valid even when its file is gone, so unrelated edits can still be saved.
			errors.push(`Field '${name}': choose a valid base`);
		} else if (draft.type === "select") {
			errors.push(...validateOptions(name, draft.options));
		}
	}
	return errors;
}

/** Column edits plus the schema mutation for `updateBaseSource`. */
export function draftsToEdits(drafts: FieldDraft[], originalNames: string[], addView: number): { edits: ColumnEdits; mutate: (f: RawFields) => void } {
	const added = drafts.filter((x) => x.originalName === null && !x.removed && x.name.trim()).map((x) => x.name);
	const edits: ColumnEdits = { add: added.length ? [{ view: addView, names: added }] : [], remove: removals(drafts), rename: renames(drafts) };
	const live = drafts.filter((x) => !x.removed);
	const mutate = (f: RawFields): void => {
		const names = new Set(live.map((x) => x.name));
		for (const original of originalNames) {
			const key = findOwnKey(f, original);
			if (key !== undefined && !names.has(key)) delete f[key];
		}
		for (const draft of live) {
			if (!draft.name.trim() || isUnsafeKey(draft.name)) continue;
			const value = draftToField(draft);
			if (value) Object.defineProperty(f, draft.name, { value, writable: true, enumerable: true, configurable: true });
			else if (Object.hasOwn(f, draft.name)) delete f[draft.name];
		}
	};
	return { edits, mutate };
}

/** Raw schema value for one draft. */
function draftToField(draft: FieldDraft): Record<string, unknown> | null {
	if (draft.type === "native") return draft.pinned;
	if (draft.type === "relation") return { type: "relation", base: draft.base, multiple: draft.multiple };
	const options = Object.create(null) as Record<string, unknown>;
	for (const o of draft.options) setOption(options, o.value, o.color);
	return { type: "select", multiple: draft.multiple, options };
}

/** OriginalName of every removed draft. */
export function removals(drafts: FieldDraft[]): string[] {
	return drafts.filter((x) => x.removed && x.originalName !== null).map((x) => x.originalName as string);
}

/** Existing, kept fields whose name changed (including case-only changes). */
export function renames(drafts: FieldDraft[]): { from: string; to: string }[] {
	return drafts
		.filter((x) => !x.removed)
		.filter((x) => x.originalName !== null && x.originalName !== x.name)
		.map((x) => ({ from: x.originalName as string, to: x.name }));
}

/** Moves a frontmatter value from `from` to `to` without touching prototypes; keys are exact, as in YAML. */
export function renameKey(frontmatter: Record<string, unknown>, from: string, to: string): "renamed" | "missing" | "conflict" {
	if (!Object.hasOwn(frontmatter, from)) return "missing";
	if (isUnsafeKey(to)) return "conflict";
	if (to === from) return "missing";
	if (Object.hasOwn(frontmatter, to)) return "conflict";
	Object.defineProperty(frontmatter, to, { value: frontmatter[from], writable: true, enumerable: true, configurable: true });
	delete frontmatter[from];
	return "renamed";
}
