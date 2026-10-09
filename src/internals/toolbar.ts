import { Notice, setIcon, type App, type EventRef, type TFile } from "obsidian";

export const TOOLBAR_MARK = "has-improved-bases";
const ITEM_CLASS = "improved-bases-toolbar-item";
const SELECTOR = `.bases-toolbar:not(.${TOOLBAR_MARK})`;

interface LeafView {
	containerEl?: HTMLElement;
	getViewType?: () => string;
	file?: { path: string; extension: string } | null;
}

/** Path of the `.base` file backing the toolbar at `el`, or null (e.g. code-block bases). */
export function resolveBasePath(app: App, el: Element): string | null {
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
}

/** Adds a "Schema" button to every Bases toolbar; the returned function removes all traces. */
export function installSchemaButton(app: App, onOpen: (basePath: string) => void): () => void {
	const inject = (toolbar: Element): void => {
		if (toolbar.classList.contains(TOOLBAR_MARK)) return;
		toolbar.classList.add(TOOLBAR_MARK);
		const button = toolbar.createEl("button", { cls: `bases-toolbar-item ${ITEM_CLASS}` });
		setIcon(button.createSpan(), "lucide-shapes");
		button.createSpan({ text: "Schema" });
		button.addEventListener("click", () => {
			const path = resolveBasePath(app, toolbar);
			if (path) onOpen(path);
			else new Notice("Could not determine the base file");
		});
	};
	const sweep = (): void => document.body.querySelectorAll(SELECTOR).forEach(inject);

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			record.addedNodes.forEach((node) => {
				if (!node.instanceOf(Element)) return;
				const cls = typeof node.className === "string" ? node.className : "";
				if (!cls.includes("bases-") && !cls.includes("workspace-leaf-content")) return;
				if (node.matches(".bases-toolbar")) inject(node);
				node.querySelectorAll(SELECTOR).forEach(inject);
			});
		}
	});

	sweep();
	observer.observe(document.body, { childList: true, subtree: true });
	const ref: EventRef = app.workspace.on("layout-change", sweep);

	return () => {
		observer.disconnect();
		app.workspace.offref(ref);
		document.querySelectorAll(`.${ITEM_CLASS}`).forEach((b) => b.remove());
		document.querySelectorAll(`.${TOOLBAR_MARK}`).forEach((t) => t.classList.remove(TOOLBAR_MARK));
	};
}
