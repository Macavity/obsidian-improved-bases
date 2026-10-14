import type { App } from "obsidian";
import type { BaseQuery } from "../query/BaseQuery";
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

/** Tracks open pickers/menus so uninstall can close them. */
export class OverlayRegistry {
	private readonly open = new Set<() => void>();

	/** Registers a close function; returns the deregistration. */
	add(close: () => void): () => void {
		this.open.add(close);
		return () => void this.open.delete(close);
	}

	closeAll(): void {
		for (const close of [...this.open]) {
			try {
				close();
			} catch (e) {
				console.error("Improved Bases: closing overlay failed", e);
			}
		}
		this.open.clear();
	}
}

export interface WidgetEnv {
	overlays: OverlayRegistry;
	membership: Membership;
	query: BaseQuery;
	writer: SchemaWriter;
	app: App;
}

/** The schema base a rendered field was taken from and the field's spelling there; schema writes go to this base. */
export interface SchemaSource {
	basePath: string;
	name: string;
}

export type PluginWidget<F extends FieldSchema> = (
	el: HTMLElement,
	value: unknown,
	ctx: PropertyRenderContext,
	field: F,
	env: WidgetEnv,
	/** Omitted only by callers outside the patch; the widget then resolves the source itself (first base by path). */
	source?: SchemaSource,
) => WidgetHandle;
