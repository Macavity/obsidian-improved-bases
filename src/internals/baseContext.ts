import type { App, TFile } from "obsidian";

interface LeafView {
	containerEl?: HTMLElement;
	getViewType?: () => string;
	file?: { path: string; extension: string } | null;
}

/**
 * `.base` file behind the Bases view that contains `el`: a Bases tab or an embedded `.base`.
 * Null elsewhere (properties panel, sidebar, code-block bases) and on any failure.
 */
export function baseContextOf(app: App, el: Element): string | null {
	try {
		let view: LeafView | null = null;
		app.workspace.iterateAllLeaves((leaf) => {
			const v = (leaf as unknown as { view?: LeafView }).view;
			if (!view && v?.containerEl?.contains(el)) view = v;
		});
		const found = view as LeafView | null;

		const embed = el.closest(".internal-embed[src]");
		if (embed) {
			const link = (embed.getAttribute("src") ?? "").split(/[#|]/)[0] ?? "";
			const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(link, found?.file?.path ?? "");
			return dest?.extension === "base" ? dest.path : null;
		}
		if (found?.getViewType?.() === "bases" && found.file?.extension === "base") return found.file.path;
		return null;
	} catch {
		return null;
	}
}
