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
