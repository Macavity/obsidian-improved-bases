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

/** Human-readable validation errors; empty when drafts are valid. */
export function validateDrafts(drafts: FieldDraft[], basePaths: string[]): string[] {
	const errors: string[] = [];
	const seen = new Set<string>();
	for (const draft of drafts) {
		const name = draft.name;
		if (!name.trim()) {
			errors.push("Field name is empty");
			continue;
		}
		if (isUnsafeKey(name)) errors.push(`Field name '${name}' is reserved`);
		const lower = name.toLowerCase();
		if (seen.has(lower)) errors.push(`Duplicate field '${name}'`);
		seen.add(lower);
		if (!TYPES.includes(draft.type)) {
			errors.push(`Field '${name}': unknown type '${String(draft.type)}'`);
			continue;
		}
		if (draft.type === "relation" && !(draft.base && basePaths.includes(draft.base))) {
			errors.push(`Field '${name}': choose a valid base`);
		}
		if (draft.type === "select") {
			const values = new Set<string>();
			for (const o of draft.options) {
				if (!o.value.trim()) errors.push(`Field '${name}': option value is empty`);
				else if (isUnsafeKey(o.value)) errors.push(`Field '${name}': option '${o.value}' is reserved`);
				else if (values.has(o.value)) errors.push(`Field '${name}': duplicate option '${o.value}'`);
				values.add(o.value);
				if (!isColor(o.color)) errors.push(`Field '${name}': invalid color for option '${o.value}'`);
			}
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
			let value: Record<string, unknown>;
			if (draft.type === "relation") {
				value = { type: "relation", base: draft.base, multiple: draft.multiple };
			} else if (draft.type === "select") {
				const options = Object.create(null) as Record<string, unknown>;
				for (const o of draft.options) setOption(options, o.value, o.color);
				value = { type: "select", multiple: draft.multiple, options };
			} else {
				value = { type: draft.type };
			}
			Object.defineProperty(f, draft.name, { value, writable: true, enumerable: true, configurable: true });
		}
	};
}

/** Existing fields whose name changed (including case-only changes). */
export function renames(drafts: FieldDraft[]): { from: string; to: string }[] {
	return drafts
		.filter((x) => x.originalName !== null && x.originalName !== x.name)
		.map((x) => ({ from: x.originalName as string, to: x.name }));
}

/** Moves a frontmatter value from `from` to `to` without touching prototypes. */
export function renameKey(frontmatter: Record<string, unknown>, from: string, to: string): "renamed" | "missing" | "conflict" {
	if (!Object.hasOwn(frontmatter, from)) return "missing";
	if (isUnsafeKey(to)) return "conflict";
	if (to === from) return "renamed";
	if (Object.hasOwn(frontmatter, to)) return "conflict";
	Object.defineProperty(frontmatter, to, { value: frontmatter[from], writable: true, enumerable: true, configurable: true });
	delete frontmatter[from];
	return "renamed";
}
