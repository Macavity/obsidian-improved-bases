import { isColor, NATIVE_TYPES, type BaseSchema, type Color, type FieldSchema, type NativeType } from "../schema/types";
import { findOwnKey, isUnsafeKey, setOption } from "../schema/keys";
import type { BaseColumns, ColumnEdits, RawFields } from "../schema/baseDoc";

/** Field kinds in the dialog: native (Obsidian's own type), or a plugin customization. */
export type DraftType = "native" | "relation" | "select";

/** All selectable field types. */
export const TYPES: readonly DraftType[] = ["native", "relation", "select"];

/** A dropdown choice: Obsidian's own type (`native`, offered only when it is no schema type), a native schema type, or a plugin type. */
export type TypeChoice = DraftType | `native:${NativeType}`;

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
	/** Pinned native entry, written back unchanged while its type is not changed. */
	pinned: Record<string, unknown> | null;
	removed: boolean;
	multiple: boolean;
	base?: string;
	options: OptionDraft[];
}

/** Obsidian's detected type as a schema native type (`multitext` is `list`); null for tags, aliases or an unknown type. */
export function detectedType(draft: FieldDraft): NativeType | null {
	const label = draft.nativeLabel === "multitext" ? "list" : draft.nativeLabel;
	return label !== null && (NATIVE_TYPES as readonly string[]).includes(label) ? (label as NativeType) : null;
}

/** Every native type, Obsidian's own first when it is not one of them, then the plugin types. */
export function typeChoices(draft: FieldDraft): TypeChoice[] {
	const own: TypeChoice[] = detectedType(draft) === null ? ["native"] : [];
	return [...own, ...NATIVE_TYPES.map((t): TypeChoice => `native:${t}`), "relation", "select"];
}

/** The choice a draft shows: its plugin type, else the pinned type, else Obsidian's. */
export function typeChoice(draft: FieldDraft): TypeChoice {
	if (draft.type !== "native") return draft.type;
	const pinned = draft.pinned?.type;
	const type = typeof pinned === "string" && (NATIVE_TYPES as readonly string[]).includes(pinned) ? pinned : detectedType(draft);
	return type === null ? "native" : `native:${type as NativeType}`;
}

/** Applies a choice: Obsidian's own type unpins, another native type pins it; plugin types keep their details. */
export function applyTypeChoice(draft: FieldDraft, choice: TypeChoice): void {
	if (choice === "relation" || choice === "select") {
		draft.type = choice;
		return;
	}
	draft.type = "native";
	const type = choice === "native" ? null : (choice.slice("native:".length) as NativeType);
	draft.pinned = type === null || type === detectedType(draft) ? null : { type };
}

/** Another schema base's definition of the same field name, with the number of this base's members that are also in it. */
export interface OtherDefinition { basePath: string; field: FieldSchema; shared: number }

/** The shape a draft would write, for comparing with other bases' definitions; null when the draft defines nothing. */
function draftShape(draft: FieldDraft): { type: string; multiple: boolean; base: string | null } | null {
	if (draft.type === "relation") return { type: "relation", multiple: draft.multiple, base: draft.base ?? null };
	if (draft.type === "select") return { type: "select", multiple: draft.multiple, base: null };
	const pinned = draft.pinned?.type;
	return typeof pinned === "string" ? { type: pinned, multiple: false, base: null } : null;
}

function fieldShape(field: FieldSchema): { type: string; multiple: boolean; base: string | null } {
	if (field.type === "relation") return { type: "relation", multiple: field.multiple, base: field.base };
	if (field.type === "select") return { type: "select", multiple: field.multiple, base: null };
	return { type: field.type, multiple: false, base: null };
}

function describe(field: FieldSchema): string {
	const shape = fieldShape(field);
	const parts = [shape.type === "relation" ? `relation to ${shape.base}` : shape.type];
	if (shape.multiple) parts.push("(multiple)");
	return parts.join(" ");
}

/**
 * Advises (never blocks) when another base defines the same field with a different type, `multiple` or target.
 * Select options and colors do not count. Null without a conflict.
 */
export function conflictHint(draft: FieldDraft, others: OtherDefinition[]): string | null {
	const mine = draftShape(draft);
	if (!mine) return null;
	const conflicts = others.filter((o) => {
		const theirs = fieldShape(o.field);
		return theirs.type !== mine.type || theirs.multiple !== mine.multiple || theirs.base !== mine.base;
	});
	if (!conflicts.length) return null;
	const overlap = (n: number): string => (n === 0 ? "no note is in both bases yet" : n === 1 ? "1 note is in both bases" : `${n} notes are in both bases`);
	return conflicts.map((o) => `Also defined in ${o.basePath} as ${describe(o.field)}; ${overlap(o.shared)}.`).join(" ");
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
		pinned: null, removed: false, multiple: false, options: [],
	};
	if (!field) return draft;
	if (field.type === "relation") {
		Object.assign(draft, { type: "relation", base: field.base, originalBase: field.base, multiple: field.multiple });
	} else if (field.type === "select") {
		Object.assign(draft, { type: "select", multiple: field.multiple, options: field.options.map((o) => ({ value: o.value, color: o.color })) });
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

/** Lowercased names of the whole list: `seen` so far, `vacated` by renames, held by `removed` drafts. */
interface NameSets { seen: Set<string>; vacated: Set<string>; removed: Set<string> }

/** New or renamed; untouched fields (e.g. a reserved key from member properties) must not block saving. */
const isNewName = (x: FieldDraft): boolean => x.originalName === null || x.originalName.toLowerCase() !== x.name.toLowerCase();

/** Name errors for one draft. */
function validateName(draft: FieldDraft, sets: NameSets): string[] {
	const name = draft.name;
	const errors: string[] = [];
	if (name !== name.trim()) errors.push(`Field name '${name}' has surrounding whitespace`);
	if (isNewName(draft) && isUnsafeKey(name)) errors.push(`Field name '${name}' is reserved`);
	const lower = name.toLowerCase();
	if (sets.seen.has(lower)) errors.push(`Duplicate field '${name}'`);
	sets.seen.add(lower);
	if (isRenamed(draft) && sets.vacated.has(lower)) errors.push(`Field '${name}': another field is renamed from this name`);
	// Saving would rename/add into this name and then strip it as part of the removal.
	if (sets.removed.has(lower)) errors.push(`Field '${name}': a removed field has this name, save the removal first`);
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
	const sets: NameSets = {
		seen: new Set<string>(),
		// Names other fields are renamed away from; renaming onto one would swap values between fields.
		vacated: new Set(drafts.filter(isRenamed).map((x) => (x.originalName as string).toLowerCase())),
		removed: new Set(removals(drafts).map((n) => n.toLowerCase())),
	};
	for (const draft of drafts.filter((x) => !x.removed)) {
		const name = draft.name;
		if (!name.trim()) {
			errors.push("Field name is empty");
			continue;
		}
		errors.push(...validateName(draft, sets));
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
	const live = drafts.filter((x) => !x.removed && x.name.trim());
	return { edits, mutate: (f) => applyDrafts(f, live, originalNames) };
}

/** Schema key a live draft writes to; an unrenamed draft keeps the existing key's spelling. */
function targetKey(f: RawFields, draft: FieldDraft): string {
	const renamed = draft.originalName !== null && draft.originalName !== draft.name;
	return renamed ? draft.name : findOwnKey(f, draft.name) ?? draft.name;
}

/** Deletes vacated schema keys, then writes every live draft under its target key. */
function applyDrafts(f: RawFields, live: FieldDraft[], originalNames: string[]): void {
	// Unsafe names still claim their key, so an untouched reserved entry survives.
	const targets = live.map((draft) => ({ draft, key: targetKey(f, draft) }));
	const kept = new Set(targets.map((t) => t.key));
	for (const original of originalNames) {
		const key = findOwnKey(f, original);
		if (key !== undefined && !kept.has(key)) delete f[key];
	}
	for (const { draft, key } of targets) {
		if (isUnsafeKey(draft.name)) continue;
		const value = draftToField(draft);
		if (value) Object.defineProperty(f, key, { value, writable: true, enumerable: true, configurable: true });
		else if (Object.hasOwn(f, key)) delete f[key];
	}
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
