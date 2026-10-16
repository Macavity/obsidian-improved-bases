import { isColor, SCHEMA_KEY } from "./types";
import { isUnsafeKey } from "./keys";
import { viewName } from "../query/target";
import type { BaseSchema, FieldSchema, SelectOption } from "./types";

export function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValidBasePath(p: unknown): p is string {
	if (typeof p !== "string" || !p.endsWith(".base") || p.length <= ".base".length) return false;
	if (p.includes("\\") || p.includes("\0") || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return false;
	return p.split("/").every((seg) => seg !== ".." && seg !== "." && seg !== "");
}

function parseRelation(name: string, raw: Record<string, unknown>, multiple: boolean, errors: string[]): FieldSchema | null {
	if (!isValidBasePath(raw.base)) {
		errors.push(`field "${name}": base must be a vault-relative path ending in .base (no "..", no absolute path)`);
		return null;
	}
	if (raw.view === undefined) return { type: "relation", base: raw.base, multiple };
	const view = viewName(raw.view);
	if (view === null || view.trim() === "") {
		errors.push(`field "${name}": view must be a non-empty string`);
		return null;
	}
	return { type: "relation", base: raw.base, multiple, view };
}

function parseOptions(name: string, raw: unknown, errors: string[]): SelectOption[] | null {
	const opts = raw ?? {};
	if (!isRecord(opts)) {
		errors.push(`field "${name}": options must be a map`);
		return null;
	}
	const options: SelectOption[] = [];
	for (const [value, color] of Object.entries(opts)) {
		if (!isColor(color)) {
			errors.push(`field "${name}": unknown color for option "${value}"`);
			return null;
		}
		options.push({ value, color });
	}
	return options;
}

function parseSelect(name: string, raw: Record<string, unknown>, multiple: boolean, errors: string[]): FieldSchema | null {
	const options = parseOptions(name, raw.options, errors);
	return options ? { type: "select", multiple, options } : null;
}

function parseField(name: string, raw: unknown, errors: string[]): FieldSchema | null {
	if (!isRecord(raw)) {
		errors.push(`field "${name}": must be a map`);
		return null;
	}
	const type = raw.type;
	if (type !== undefined && typeof raw.multiple !== "undefined" && typeof raw.multiple !== "boolean") {
		errors.push(`field "${name}": multiple must be a boolean`);
		return null;
	}
	const multiple = raw.multiple === true;
	if (type === "relation") return parseRelation(name, raw, multiple, errors);
	if (type === "select") return parseSelect(name, raw, multiple, errors);
	if (typeof type === "string" && type.length > 0 && !isUnsafeKey(type)) return { type };
	errors.push(`field "${name}": unknown type`);
	return null;
}

export function parseSchema(basePath: string, raw: unknown): { schema: BaseSchema | null; errors: string[] } {
	if (!isRecord(raw) || !Object.prototype.hasOwnProperty.call(raw, SCHEMA_KEY)) {
		return { schema: null, errors: [] };
	}
	const section = raw[SCHEMA_KEY];
	if (!isRecord(section)) return { schema: null, errors: [`${SCHEMA_KEY}: must be a map`] };
	const rawFields = section.fields ?? {};
	if (!isRecord(rawFields)) return { schema: null, errors: [`${SCHEMA_KEY}.fields: must be a map`] };

	const errors: string[] = [];
	const fields: BaseSchema["fields"] = new Map();
	for (const [name, def] of Object.entries(rawFields)) {
		if (isUnsafeKey(name)) {
			errors.push(`field "${name}": reserved name`);
			continue;
		}
		const key = name.toLowerCase();
		if (fields.has(key)) {
			errors.push(`duplicate field name "${name}"`);
			continue;
		}
		const field = parseField(name, def, errors);
		if (field) fields.set(key, { name, field });
	}
	if (errors.length) return { schema: null, errors };
	// The icon is cosmetic: a blank, null or non-string value means "no default icon", never an invalid schema.
	const icon = typeof section.icon === "string" ? section.icon.trim() : "";
	return { schema: icon ? { basePath, icon, fields } : { basePath, fields }, errors: [] };
}
