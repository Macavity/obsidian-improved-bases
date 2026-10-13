import { COLORS, type Color, type SelectField } from "../schema/types";
import type { RawFields } from "../schema/SchemaWriter";
import { isUnsafeKey, setOption } from "../schema/keys";
import { isRecord } from "../schema/parse";

/** string | string[] | null → string[] (non-strings and empty strings are dropped). */
export function toList(value: unknown): string[] {
	if (typeof value === "string") return value ? [value] : [];
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v !== "");
	return [];
}

/** Value in schema format: `multiple` writes a list, otherwise the first link or null. */
export function relationOutput(links: string[], multiple: boolean): string | string[] | null {
	if (multiple) return links;
	return links[0] ?? null;
}

/** "[[A|x]]" → "A", "[[A#H]]" → "A"; null when the string is not a wikilink. */
export function linkTarget(raw: string): string | null {
	const m = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(raw);
	if (!m?.[1]) return null;
	const target = m[1].split("|")[0]?.split("#")[0]?.split("^")[0]?.trim();
	return target ? target : null;
}

/** Value in schema format: `multiple` writes a list, otherwise the first value or null. */
export function selectOutput(values: string[], multiple: boolean): string | string[] | null {
	if (multiple) return values;
	return values[0] ?? null;
}

/** Color of an option; values without an option are grey. */
export function colorOf(field: SelectField, value: string): Color {
	return field.options.find((o) => o.value === value)?.color ?? "grey";
}

function optionsOf(fields: RawFields, fieldName: string): Record<string, unknown> | null {
	if (isUnsafeKey(fieldName) || !Object.hasOwn(fields, fieldName)) return null;
	const f = fields[fieldName];
	if (!f) return null;
	const raw = f.options;
	if (isRecord(raw)) return raw;
	const created: Record<string, unknown> = {};
	f.options = created;
	return created;
}

const PALETTE = COLORS.filter((c) => c !== "grey" && c !== "black" && c !== "white");

/** Color for a new option: cycles the palette (no grey, black, white) by the number of existing options. */
export function nextOptionColor(existingCount: number): Color {
	return PALETTE[existingCount % PALETTE.length] ?? "red";
}

/** Adds an option with the given color; an existing option is kept as is. */
export function addOptionMutation(fieldName: string, value: string, color: Color): (f: RawFields) => void {
	return (fields) => {
		const options = optionsOf(fields, fieldName);
		if (options && !Object.hasOwn(options, value)) setOption(options, value, color);
	};
}

/** Sets the color of an option (creating the option when missing). */
export function setColorMutation(fieldName: string, value: string, color: Color): (f: RawFields) => void {
	return (fields) => {
		const options = optionsOf(fields, fieldName);
		if (options) setOption(options, value, color);
	};
}

/** Value with `from` replaced by `to` (lists are deduplicated); undefined when nothing matches. */
export function renameValue(value: unknown, from: string, to: string): unknown {
	if (typeof value === "string") return value === from ? to : undefined;
	if (!Array.isArray(value) || !value.includes(from)) return undefined;
	return [...new Set((value as unknown[]).map((v) => (v === from ? to : v)))];
}

/** Value without `target`: a matching string becomes null, lists drop the element; undefined when nothing matches. */
export function removeValue(value: unknown, target: string): unknown {
	if (typeof value === "string") return value === target ? null : undefined;
	if (!Array.isArray(value) || !value.includes(target)) return undefined;
	return value.filter((v) => v !== target);
}

/** Number of notes (one entry each) whose value contains `target`. */
export function countNotesWithValue(values: readonly unknown[], target: string): number {
	return values.filter((v) => toList(v).includes(target)).length;
}

/** Renames an option, keeping its color and its position; no-op when `from` is missing or `to` exists. */
export function renameOptionMutation(fieldName: string, from: string, to: string): (f: RawFields) => void {
	return (fields) => {
		const options = optionsOf(fields, fieldName);
		const f = options && fields[fieldName];
		if (!options || !f || !Object.hasOwn(options, from) || Object.hasOwn(options, to)) return;
		const rebuilt: Record<string, unknown> = {};
		for (const [key, color] of Object.entries(options)) setOption(rebuilt, key === from ? to : key, color as string);
		f.options = rebuilt;
	};
}

/** Removes an option from the field. */
export function removeOptionMutation(fieldName: string, value: string): (f: RawFields) => void {
	return (fields) => {
		const options = optionsOf(fields, fieldName);
		if (options && Object.hasOwn(options, value)) delete options[value];
	};
}
