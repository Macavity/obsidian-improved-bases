import type { App, EventRef } from "obsidian";
import { around } from "monkey-around";
import type { NativeType, RelationField, SelectField } from "../schema/types";
import type { PluginWidget, PropertyRenderContext, WidgetEnv } from "../widgets/types";
import { getMetadataTypeManager, type MetadataTypeManager, type TypeInfo, type TypeWidget } from "./detect";

export interface TypeInfoPatch {
	/** Forces Obsidian to rebuild the widgets for these fields (new hull identity + `changed`). */
	refresh(fieldNames: string[]): void;
	uninstall(): void;
}

export interface PluginWidgets {
	relation: PluginWidget<RelationField>;
	select: PluginWidget<SelectField>;
}

/** Obsidian widget used for each native schema type. */
const NATIVE_WIDGET: Record<NativeType, string> = {
	text: "text",
	list: "multitext",
	number: "number",
	checkbox: "checkbox",
	date: "date",
	datetime: "datetime",
};

interface CacheEntry {
	generation: number;
	hull: TypeWidget;
}

/**
 * Wraps `metadataTypeManager.getTypeInfo`. For property names that appear in any schema it returns a hull
 * widget (as `expected` and `inferred`) that decides per `ctx.sourcePath` which widget renders:
 * plugin widget, native widget of the schema type, or Obsidian's original. Returns null when the internals
 * are missing (unsupported Obsidian version); nothing is patched then.
 */
export function installTypeInfoPatch(app: App, env: WidgetEnv, widgets: PluginWidgets): TypeInfoPatch | null {
	const mtm = getMetadataTypeManager(app);
	if (!mtm) return null;
	const { membership } = env;
	let active = true;
	// The table only rebuilds a cell when the identity of `inferred` changes, so `refresh` bumps the generation.
	let generation = 0;
	const cache = new Map<TypeWidget, Map<TypeWidget, Map<string, CacheEntry>>>();

	const original = (info: TypeInfo, value: unknown): TypeWidget => {
		try {
			return info.expected.validate(value) ? info.expected : info.inferred;
		} catch {
			return info.inferred;
		}
	};

	const renderPlugin = (el: HTMLElement, value: unknown, ctx: PropertyRenderContext, mtm: MetadataTypeManager): unknown => {
		const field = membership.resolve(ctx.sourcePath, ctx.key);
		if (!field) return undefined;
		if (field.type === "relation") return widgets.relation(el, value, ctx, field, env);
		if (field.type === "select") return widgets.select(el, value, ctx, field, env);
		const native = mtm.registeredTypeWidgets[NATIVE_WIDGET[field.type]];
		return native ? native.render(el, value, ctx) : undefined;
	};

	const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");

	/**
	 * `validate` gets no file context (measured 2026-10-09: one argument), so this only checks the value's shape
	 * against the shapes any schema allows for the field name.
	 */
	const validateShape = (info: TypeInfo, name: string, value: unknown): boolean => {
		const shapes = membership.shapesFor(name);
		if (value === null || value === undefined) {
			if (shapes.has("list") || shapes.has("scalar")) return true;
		} else {
			if (shapes.has("list") && isStringArray(value)) return true;
			if (shapes.has("scalar") && typeof value === "string") return true;
		}
		return info.expected.validate(value);
	};

	const makeHull = (info: TypeInfo, name: string): TypeWidget => ({
		...info.expected,
		type: info.expected.type,
		icon: info.expected.icon,
		name: info.expected.name,
		validate: (value: unknown) => validateShape(info, name, value),
		render(el: HTMLElement, value: unknown, ctx: unknown): unknown {
			if (active) {
				try {
					const handle = renderPlugin(el, value, ctx as PropertyRenderContext, mtm);
					if (handle !== undefined) return handle;
				} catch (e) {
					console.error("Improved Bases: widget failed, falling back to native widget", e);
					el.replaceChildren();
				}
			}
			return original(info, value).render(el, value, ctx);
		},
	});

	const hullFor = (info: TypeInfo, name: string): TypeWidget => {
		let byInferred = cache.get(info.expected);
		if (!byInferred) {
			byInferred = new Map<TypeWidget, Map<string, CacheEntry>>();
			cache.set(info.expected, byInferred);
		}
		let inner = byInferred.get(info.inferred);
		if (!inner) {
			inner = new Map<string, CacheEntry>();
			byInferred.set(info.inferred, inner);
		}
		let entry = inner.get(name);
		if (!entry || entry.generation !== generation) {
			entry = { generation, hull: makeHull(info, name) };
			inner.set(name, entry);
		}
		return entry.hull;
	};

	const uninstallPatch = around(mtm, {
		getTypeInfo(next) {
			return function (this: MetadataTypeManager, name: string, value: unknown): TypeInfo {
				const info = next.call(this, name, value);
				if (!active) return info;
				try {
					if (!info?.expected || !info.inferred) return info;
					const key = String(name).toLowerCase();
					if (!membership.knownFieldNames().has(key)) return info;
					const hull = hullFor(info, key);
					return { ...info, expected: hull, inferred: hull };
				} catch (e) {
					console.error("Improved Bases: getTypeInfo patch failed", e);
					return info;
				}
			};
		},
	});

	const trigger = (names: Iterable<string>): void => {
		for (const name of names) {
			try {
				mtm.trigger("changed", name);
			} catch (e) {
				console.error("Improved Bases: refresh failed", e);
			}
		}
	};

	const refresh = (fieldNames: string[]): void => {
		if (!active || !fieldNames.length) return;
		generation++;
		trigger(fieldNames);
	};

	const refs: EventRef[] = [];
	const listen = (ref: EventRef | undefined): void => {
		if (ref) refs.push(ref);
	};
	listen(membership.on("changed", (names: string[]) => refresh(names)));
	// Target entries changed: relation widgets need fresh options; known names cover all relation fields.
	listen(membership.on("targets-changed", () => refresh([...membership.knownFieldNames()])));

	// Re-enabling at runtime: already rendered cells/panels still hold the original widgets.
	refresh([...membership.knownFieldNames()]);

	return {
		refresh,
		uninstall() {
			if (!active) return;
			const names = [...membership.knownFieldNames()];
			active = false;
			env.overlays.closeAll();
			for (const ref of refs) membership.offref(ref);
			refs.length = 0;
			uninstallPatch();
			cache.clear();
			trigger(names);
		},
	};
}
