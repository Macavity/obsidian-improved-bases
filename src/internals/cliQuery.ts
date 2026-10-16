import { App, TFile } from "obsidian";
import type { QueryTarget } from "../query/target";
import { getCliHandler } from "./detect";

const HANDLER = "base:query";

export function cliQueryAvailable(app: App): boolean {
	return getCliHandler(app, HANDLER) !== null;
}

/** Runs a base query through Obsidian's internal CLI handler (desktop only). Full vault scan, no change events. */
export async function cliQuery(app: App, target: QueryTarget): Promise<TFile[]> {
	const handler = getCliHandler(app, HANDLER);
	if (!handler) throw new Error("base:query handler not available");
	const params: Record<string, string> = { path: target.base, format: "paths" };
	if (target.view !== undefined) params.view = target.view;
	const out: unknown = await handler(params);
	if (typeof out !== "string") throw new Error("base:query returned an unexpected result");
	if (out.startsWith("Error:")) throw new Error(out);
	return out
		.split("\n")
		.filter(Boolean)
		.map((p) => app.vault.getFileByPath(p))
		.filter((f): f is TFile => f !== null);
}
