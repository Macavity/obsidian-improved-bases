import { isColor, NATIVE_TYPES, type Color, type FieldSchema } from "../schema/types";
import { findOwnKey, isUnsafeKey, setOption } from "../schema/keys";
import type { RawFields } from "../schema/SchemaWriter";

/** One select option while editing. */
export interface OptionDraft { value: string; color: Color }

/** Editable copy of a field; `originalName` is null for new fields. */
export interface FieldDraft {
	originalName: string | null;
	name: string;
	type: FieldSchema["type"];
	multiple: boolean;
	base?: string;
	options: OptionDraft[];
}

/** All selectable field types. */
export const TYPES: readonly FieldSchema["type"][] = ["relation", "select", ...NATIVE_TYPES];

/** Drafts in map order. */
export function fieldsToDrafts(fields: ReadonlyMap<string, { name: string; field: FieldSchema }>): FieldDraft[] {
	return [...fields.values()].map(({ name, field }) => {
		const draft: FieldDraft = { originalName: name, name, type: field.type, multiple: false, options: [] };
		if (field.type === "relation") {
			draft.multiple = field.multiple;
			draft.base = field.base;
		} else if (field.type === "select") {
			draft.multiple = field.multiple;
			draft.options = field.options.map((o) => ({ value: o.value, color: o.color }));
		}
		return draft;
	});
}

const isRenamed = (x: FieldDraft): boolean => x.originalName !== null && x.originalName.toLowerCase() !== x.name.toLowerCase();

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
	for (const draft of drafts) {
		const name = draft.name;
		if (!name.trim()) {
			errors.push("Field name is empty");
			continue;
		}
		errors.push(...validateName(draft, seen, vacated));
		if (!TYPES.includes(draft.type)) {
			errors.push(`Field '${name}': unknown type '${String(draft.type)}'`);
		} else if (draft.type === "relation" && !(draft.base && basePaths.includes(draft.base))) {
			errors.push(`Field '${name}': choose a valid base`);
		} else if (draft.type === "select") {
			errors.push(...validateOptions(name, draft.options));
		}
	}
	return errors;
}

/** Mutation for `updateSchemaSource`: removes dropped/renamed fields, writes all drafts. */
export function draftsToMutation(drafts: FieldDraft[], originalNames: string[]): (f: RawFields) => void {
	return (f) => {
		const names = new Set(drafts.map((x) => x.name));
		for (const original of originalNames) {
			const key = findOwnKey(f, original);
			if (key !== undefined && !names.has(key)) delete f[key];
		}
		for (const draft of drafts) {
			if (!draft.name.trim() || isUnsafeKey(draft.name)) continue;
			Object.defineProperty(f, draft.name, { value: draftToField(draft), writable: true, enumerable: true, configurable: true });
		}
	};
}

/** Raw schema value for one draft. */
function draftToField(draft: FieldDraft): Record<string, unknown> {
	if (draft.type === "relation") return { type: "relation", base: draft.base, multiple: draft.multiple };
	if (draft.type !== "select") return { type: draft.type };
	const options = Object.create(null) as Record<string, unknown>;
	for (const o of draft.options) setOption(options, o.value, o.color);
	return { type: "select", multiple: draft.multiple, options };
}

/** Existing fields whose name changed (including case-only changes). */
export function renames(drafts: FieldDraft[]): { from: string; to: string }[] {
	return drafts
		.filter((x) => x.originalName !== null && x.originalName !== x.name)
		.map((x) => ({ from: x.originalName as string, to: x.name }));
}

/** Moves a frontmatter value from `from` (any case) to `to` without touching prototypes. */
export function renameKey(frontmatter: Record<string, unknown>, from: string, to: string): "renamed" | "missing" | "conflict" {
	// Keys match case-insensitively, as the plugin resolves properties that way.
	const key = findOwnKey(frontmatter, from);
	if (key === undefined) return "missing";
	if (isUnsafeKey(to)) return "conflict";
	if (key === to) return "missing"; // already in the target form, nothing to move
	const existing = findOwnKey(frontmatter, to);
	if (existing !== undefined && existing !== key) return "conflict";
	Object.defineProperty(frontmatter, to, { value: frontmatter[key], writable: true, enumerable: true, configurable: true });
	delete frontmatter[key];
	return "renamed";
}
