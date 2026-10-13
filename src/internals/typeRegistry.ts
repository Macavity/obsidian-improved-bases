import type { MetadataTypeManager, TypeWidget } from "./detect";

/** One property type as Obsidian registers it: id, localized name and icon; reserved types are bound to fixed keys (tags, aliases, …). */
export interface PropertyType {
	type: string;
	name: string;
	icon: string;
	reserved: boolean;
}

const DEFAULT_ICON = "lucide-text";

/** The widget's display name; Obsidian stores a string or a getter. Falls back to the id. */
function nameOf(widget: TypeWidget, fallback: string): string {
	try {
		const name = typeof widget.name === "function" ? (widget.name as () => unknown)() : widget.name;
		return typeof name === "string" && name ? name : fallback;
	} catch {
		return fallback;
	}
}

/** Every registered property type in registry order, keyed by its registry key (that is what the schema stores and the patch looks up); empty when the internals are missing. */
export function listPropertyTypes(mtm: MetadataTypeManager | null): PropertyType[] {
	if (!mtm) return [];
	const types: PropertyType[] = [];
	for (const [type, widget] of Object.entries(mtm.registeredTypeWidgets)) {
		if (!widget) continue;
		types.push({ type, name: nameOf(widget, type), icon: widget.icon || DEFAULT_ICON, reserved: widget.reservedKeys !== undefined });
	}
	return types;
}

/** The registered type with this id, or a placeholder naming it as not registered. */
export function propertyTypeOf(types: readonly PropertyType[], type: string): PropertyType {
	return types.find((t) => t.type === type) ?? { type, name: `${type} (not registered)`, icon: DEFAULT_ICON, reserved: false };
}
