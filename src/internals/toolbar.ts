import { Notice, setIcon, type App, type EventRef, type TFile } from "obsidian";

const ITEM_CLASS = "improved-bases-toolbar-item";
const SELECTOR = ".bases-toolbar";
// Probed live (Obsidian 1.14.4, installer 1.12.7, 2026-10-10): the view switcher is
// `.bases-toolbar-item.bases-toolbar-views-menu > .text-icon-button > .text-button-label`, its text is the active view name.
const VIEW_NAME_SELECTOR = ".bases-toolbar-views-menu .text-button-label";

interface LeafView {
	containerEl?: HTMLElement;
	getViewType?: () => string;
	file?: { path: string; extension: string } | null;
}

/** Path of the `.base` file backing the toolbar at `el` plus the active view name (null if not shown), or null (e.g. code-block bases). */
export function resolveBase(app: App, el: Element): { path: string; viewName: string | null } | null {
	const path = resolvePath(app, el);
	if (!path) return null;
	const viewName = el.querySelector(VIEW_NAME_SELECTOR)?.textContent?.trim() || null;
	return { path, viewName };
}

function resolvePath(app: App, el: Element): string | null {
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

/** Adds a "Schema" button to every Bases toolbar backed by a file; the returned function removes all traces. */
export function installSchemaButton(app: App, onOpen: (basePath: string, viewName: string | null) => void): () => void {
	const inject = (toolbar: Element): void => {
		// Code-block bases have no file; checking for the button (not a marker) survives Bases re-rendering the toolbar.
		if (toolbar.closest(".block-language-base") || toolbar.querySelector(`.${ITEM_CLASS}`)) return;
		// Same markup as Obsidian's own items (div > div.text-icon-button); a <button> would get the filled button style.
		const item = toolbar.createDiv({ cls: `bases-toolbar-item ${ITEM_CLASS}` });
		const button = item.createDiv({ cls: "text-icon-button tappable", attr: { role: "button", tabindex: "0" } });
		setIcon(button.createSpan({ cls: "text-button-icon" }), "lucide-shapes");
		button.createSpan({ cls: "text-button-label", text: "Schema" });
		const open = (): void => {
			const base = resolveBase(app, toolbar);
			if (base) onOpen(base.path, base.viewName);
			else new Notice("Could not determine the base file");
		};
		button.addEventListener("click", open);
		button.addEventListener("keydown", (e) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			open();
		});
	};
	const sweep = (): void => document.body.querySelectorAll(SELECTOR).forEach(inject);

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			record.addedNodes.forEach((node) => {
				// No class pre-filter: embeds arrive wrapped in neutral containers (e.g. `div.el-p`).
				if (!node.instanceOf(Element)) return;
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
	};
}
