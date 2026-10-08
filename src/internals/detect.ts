import { App, Platform, Plugin } from "obsidian";

/** Undocumented CLI handler as registered by Obsidian (`app.cli.handlers`). */
export type CliHandler = (args: Record<string, string>) => unknown;

interface CliRegistry {
	handlers?: { get?: (name: string) => { handler?: unknown } | undefined };
}

/** Returns the internal CLI handler for `name`, or null when the internals are missing or have an unexpected shape. */
export function getCliHandler(app: App, name: string): CliHandler | null {
	if (!Platform.isDesktop) return null;
	const cli = (app as unknown as { cli?: CliRegistry }).cli;
	const get = cli?.handlers?.get;
	if (typeof get !== "function") return null;
	try {
		const handler = get.call(cli?.handlers, name)?.handler;
		return typeof handler === "function" ? (handler as CliHandler) : null;
	} catch {
		return null;
	}
}

/** True when the public Bases view API (`registerBasesView`) exists. */
export function hasBasesViewApi(plugin: Plugin): boolean {
	return typeof (plugin as Partial<Plugin>).registerBasesView === "function";
}

/** Shape of a registered property type widget (`metadataTypeManager.registeredTypeWidgets[type]`). */
export interface TypeWidget {
	type: string;
	icon?: string;
	name?: unknown;
	validate(value: unknown): boolean;
	render(el: HTMLElement, value: unknown, ctx: unknown): unknown;
}

export interface TypeInfo {
	expected: TypeWidget;
	inferred: TypeWidget;
}

/** Undocumented `app.metadataTypeManager`, reduced to what the getTypeInfo patch uses. */
export interface MetadataTypeManager {
	registeredTypeWidgets: Record<string, TypeWidget | undefined>;
	getTypeInfo(name: string, value: unknown): TypeInfo;
	trigger(name: string, ...args: unknown[]): void;
}

/** Returns `app.metadataTypeManager` when it has the shape the getTypeInfo patch needs, else null. */
export function getMetadataTypeManager(app: App): MetadataTypeManager | null {
	const mtm = (app as unknown as { metadataTypeManager?: Partial<MetadataTypeManager> }).metadataTypeManager;
	if (!mtm || typeof mtm.getTypeInfo !== "function" || typeof mtm.trigger !== "function") return null;
	if (typeof mtm.registeredTypeWidgets?.text?.render !== "function") return null;
	return mtm as MetadataTypeManager;
}
