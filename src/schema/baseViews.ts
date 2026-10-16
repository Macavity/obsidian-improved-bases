import { parseYaml, TFile, type App } from "obsidian";
import { viewName } from "../query/target";

/** `views[].name` of a base file in file order (number/boolean names as strings, other types skipped); null if the file is missing, unreadable or not a YAML mapping. */
export async function baseViewNames(app: App, basePath: string): Promise<string[] | null> {
	const file = app.vault.getAbstractFileByPath(basePath);
	if (!(file instanceof TFile)) return null;
	let raw: unknown;
	try {
		raw = parseYaml(await app.vault.cachedRead(file));
	} catch {
		return null;
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const views = (raw as { views?: unknown }).views;
	if (!Array.isArray(views)) return [];
	return views.flatMap((v: unknown) => {
		const name = typeof v === "object" && v !== null ? viewName((v as { name?: unknown }).name) : null;
		return name === null ? [] : [name];
	});
}
