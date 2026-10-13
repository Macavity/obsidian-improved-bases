import type { MetadataTypeManager, TypeWidget } from "./detect";

/** One property type as Obsidian registers it: id, localized name and icon; reserved types are bound to fixed keys (tags, aliases, …). */
export interface PropertyType {
	type: string;
	name: string;
	icon: string;
	reserved: boolean;
	/** The widget's value check; a throwing check counts as valid. */
	validate?: (value: unknown) => boolean;
}

const DEFAULT_ICON = "lucide-text";

/** The widget's display name; Obsidian stores a string or a getter. Falls back to the id. */
export function nameOf(widget: TypeWidget, fallback: string): string {
	try {
		const name = typeof widget.name === "function" ? (widget.name as () => unknown)() : widget.name;
		return typeof name === "string" && name ? name : fallback;
	} catch {
		return fallback;
	}
}

/** A third-party check that throws must not turn a value into a mismatch. */
function safeValidate(widget: TypeWidget): (value: unknown) => boolean {
	return (value) => {
		try {
			return widget.validate(value);
		} catch {
			return true;
		}
	};
}

/** Every registered property type in registry order, keyed by its registry key (that is what the schema stores and the patch looks up); empty when the internals are missing. */
export function listPropertyTypes(mtm: MetadataTypeManager | null): PropertyType[] {
	if (!mtm) return [];
	const types: PropertyType[] = [];
	for (const [type, widget] of Object.entries(mtm.registeredTypeWidgets)) {
		if (!widget) continue;
		types.push({ type, name: nameOf(widget, type), icon: widget.icon || DEFAULT_ICON, reserved: widget.reservedKeys !== undefined, validate: safeValidate(widget) });
	}
	return types;
}

/** The registered type with this id, or a placeholder naming it as not registered. */
export function propertyTypeOf(types: readonly PropertyType[], type: string): PropertyType {
	return types.find((t) => t.type === type) ?? { type, name: `${type} (not registered)`, icon: DEFAULT_ICON, reserved: false };
}
