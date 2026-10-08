import { App, TFile } from "obsidian";
import { getCliHandler } from "./detect";

const HANDLER = "base:query";

export function cliQueryAvailable(app: App): boolean {
	return getCliHandler(app, HANDLER) !== null;
}

/** Runs a base query through Obsidian's internal CLI handler (desktop only). Full vault scan, no change events. */
export async function cliQuery(app: App, basePath: string): Promise<TFile[]> {
	const handler = getCliHandler(app, HANDLER);
	if (!handler) throw new Error("base:query handler not available");
	const out: unknown = await handler({ path: basePath, format: "paths" });
	if (typeof out !== "string") throw new Error("base:query returned an unexpected result");
	if (out.startsWith("Error:")) throw new Error(out);
	return out
		.split("\n")
		.filter(Boolean)
		.map((p) => app.vault.getFileByPath(p))
		.filter((f): f is TFile => f !== null);
}
