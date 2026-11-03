import type { MetadataTypeManager, TypeWidget } from "./detect";

/** Property type ids this plugin registers with Obsidian. */
const PLUGIN_TYPE_IDS = ["select", "relation"] as const;
export type PluginTypeId = (typeof PLUGIN_TYPE_IDS)[number];

export interface PluginTypeRegistration {
	/** Ids this plugin registered. */
	registered: ReadonlySet<PluginTypeId>;
	/** Ids already taken by another plugin; left untouched. */
	skipped: PluginTypeId[];
	/** Removes only entries still identical to our own widget. Triggers nothing; the caller refreshes. */
	unregister(): void;
}

/** Registers the plugin's widgets in `registeredTypeWidgets` for every free id. */
export function registerPluginTypes(mtm: MetadataTypeManager, widgets: Record<PluginTypeId, TypeWidget>): PluginTypeRegistration {
	const registered = new Set<PluginTypeId>();
	const skipped: PluginTypeId[] = [];
	for (const id of PLUGIN_TYPE_IDS) {
		if (mtm.registeredTypeWidgets[id]) {
			skipped.push(id);
			continue;
		}
		mtm.registeredTypeWidgets[id] = widgets[id];
		registered.add(id);
	}
	return {
		registered,
		skipped,
		unregister() {
			for (const id of registered) {
				if (mtm.registeredTypeWidgets[id] === widgets[id]) delete mtm.registeredTypeWidgets[id];
			}
		},
	};
}
