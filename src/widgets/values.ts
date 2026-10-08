import type { Color, SelectField } from "../schema/types";
import type { RawFields } from "../schema/SchemaWriter";

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
	const f = fields[fieldName];
	if (!f) return null;
	const raw = f.options;
	if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
	const created: Record<string, unknown> = {};
	f.options = created;
	return created;
}

/** Adds an option with color grey; an existing option is kept as is. */
export function addOptionMutation(fieldName: string, value: string): (f: RawFields) => void {
	return (fields) => {
		const options = optionsOf(fields, fieldName);
		if (options && !(value in options)) options[value] = "grey";
	};
}

/** Sets the color of an option (creating the option when missing). */
export function setColorMutation(fieldName: string, value: string, color: Color): (f: RawFields) => void {
	return (fields) => {
		const options = optionsOf(fields, fieldName);
		if (options) options[value] = color;
	};
}
