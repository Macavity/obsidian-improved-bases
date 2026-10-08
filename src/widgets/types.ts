import type { App } from "obsidian";
import type { Membership } from "../schema/Membership";
import type { SchemaWriter } from "../schema/SchemaWriter";
import type { FieldSchema } from "../schema/types";

/** Context Obsidian passes to a property widget's `render` (table cell, properties panel, sidebar). */
export interface PropertyRenderContext {
	app: App;
	/** Property name: lowercase from the table, original spelling from the panel. */
	key: string;
	sourcePath: string;
	hoverSource?: string;
	onChange(value: unknown): void;
	blur(): void;
}

export interface WidgetHandle {
	type: string;
	focus(mode?: string): void;
}

export interface WidgetEnv {
	membership: Membership;
	writer: SchemaWriter;
	app: App;
}

export type PluginWidget<F extends FieldSchema> = (
	el: HTMLElement,
	value: unknown,
	ctx: PropertyRenderContext,
	field: F,
	env: WidgetEnv,
) => WidgetHandle;
