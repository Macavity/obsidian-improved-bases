import { parseYaml, TFile, type App } from "obsidian";

/** `views[].name` of a base file in file order (non-string names skipped); null if the file is missing or not a YAML mapping. */
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
		const name = typeof v === "object" && v !== null ? (v as { name?: unknown }).name : undefined;
		return typeof name === "string" ? [name] : [];
	});
}
