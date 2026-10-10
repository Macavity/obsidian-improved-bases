import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { installSchemaButton, resolveBase } from "../src/internals/toolbar";

function div(parent: HTMLElement, cls: string, attr: Record<string, string> = {}): HTMLElement {
	const el = document.createElement("div");
	el.className = cls;
	for (const [k, v] of Object.entries(attr)) el.setAttribute(k, v);
	parent.appendChild(el);
	return el;
}
function leaf(containerEl: HTMLElement, type: string, path: string | null) {
	return { view: { containerEl, getViewType: () => type, file: path ? { path, extension: path.split(".").pop() } : null } };
}
function app(leaves: unknown[], dest: Record<string, { path: string; extension: string }> = {}): App {
	const refs: (() => void)[] = [];
	return {
		workspace: {
			iterateAllLeaves: (cb: (l: unknown) => void) => leaves.forEach(cb),
			on: (_n: string, cb: () => void) => {
				refs.push(cb);
				return cb;
			},
			offref: vi.fn(),
			triggerLayout: () => refs.forEach((r) => r()),
		},
		metadataCache: { getFirstLinkpathDest: (link: string) => dest[link] ?? null },
	} as unknown as App;
}
const toolbar = (parent: HTMLElement) => div(div(parent, "bases-header"), "bases-toolbar");

describe("resolveBase", () => {
	it("resolves a bases leaf", () => {
		const c = document.createElement("div");
		const t = toolbar(c);
		expect(resolveBase(app([leaf(c, "bases", "A.base")]), t)).toEqual({ path: "A.base", viewName: null });
	});
	it("resolves an embed through the containing note", () => {
		const c = document.createElement("div");
		const e = div(c, "internal-embed", { src: "Mitarbeiter.base#x" });
		const t = toolbar(e);
		const a = app([leaf(c, "markdown", "Notizen/N.md")], { "Mitarbeiter.base": { path: "Mitarbeiter.base", extension: "base" } });
		expect(resolveBase(a, t)).toEqual({ path: "Mitarbeiter.base", viewName: null });
	});
	it("reads the current view name from the toolbar switcher", () => {
		const container = div(document.body, "workspace-leaf-content");
		const tb = toolbar(container);
		const item = div(tb, "bases-toolbar-item bases-toolbar-views-menu");
		div(item, "text-button-label").textContent = "Karten";
		const a = app([leaf(container, "bases", "Teams.base")]);
		expect(resolveBase(a, tb)).toEqual({ path: "Teams.base", viewName: "Karten" });
		expect(resolveBase(a, toolbar(container))).toEqual({ path: "Teams.base", viewName: null });
	});
	it("returns null for code-block bases and non-base embeds", () => {
		const c = document.createElement("div");
		const t = toolbar(div(c, "block-language-base"));
		expect(resolveBase(app([leaf(c, "markdown", "N.md")]), t)).toBeNull();
		const e = div(c, "internal-embed", { src: "X" });
		const t2 = toolbar(e);
		expect(resolveBase(app([leaf(c, "markdown", "N.md")], { X: { path: "X.md", extension: "md" } }), t2)).toBeNull();
	});
});

describe("installSchemaButton", () => {
	it("is safe without toolbars", () => {
		document.body.innerHTML = "";
		expect(() => installSchemaButton(app([]), vi.fn())()).not.toThrow();
	});
	it("injects once per toolbar via sweep and observer, and uninstalls", async () => {
		document.body.innerHTML = "";
		const c = div(document.body, "workspace-leaf-content");
		const t1 = toolbar(c);
		div(div(t1, "bases-toolbar-item bases-toolbar-views-menu"), "text-button-label").textContent = " Tabelle ";
		const onOpen = vi.fn();
		const a = app([leaf(c, "bases", "A.base")]);
		const off = installSchemaButton(a, onOpen);
		expect(t1.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		(a.workspace as unknown as { triggerLayout(): void }).triggerLayout();
		expect(t1.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		const c2 = div(document.body, "el-p"); // neutral wrapper, as Obsidian renders embeds
		const t2 = toolbar(div(div(c2, "internal-embed"), "bases-embed"));
		await new Promise((r) => setTimeout(r, 0));
		expect(t2.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		(t1.querySelector(".improved-bases-toolbar-item .text-icon-button") as HTMLElement).click();
		expect(onOpen).toHaveBeenCalledWith("A.base", "Tabelle");
		off();
		expect((a.workspace as unknown as { offref: ReturnType<typeof vi.fn> }).offref).toHaveBeenCalled();
		expect(document.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(0);
	});
	it("mirrors the native toolbar item markup so Obsidian's button styles do not apply", () => {
		document.body.innerHTML = "";
		const c = div(document.body, "workspace-leaf-content");
		const t = toolbar(c);
		const onOpen = vi.fn();
		const off = installSchemaButton(app([leaf(c, "bases", "A.base")]), onOpen);
		const item = t.querySelector(".improved-bases-toolbar-item") as HTMLElement;
		expect(item.tagName).toBe("DIV");
		expect(item.classList.contains("bases-toolbar-item")).toBe(true);
		expect(t.querySelector("button")).toBeNull();
		const button = item.querySelector(".text-icon-button") as HTMLElement;
		expect(button.getAttribute("role")).toBe("button");
		expect(button.getAttribute("tabindex")).toBe("0");
		expect(button.querySelector(".text-button-icon")?.getAttribute("data-icon")).toBe("lucide-shapes");
		expect(button.querySelector(".text-button-label")?.textContent).toBe("Schema");
		button.click();
		button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		button.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		expect(onOpen).toHaveBeenCalledTimes(3);
		off();
	});
	it("skips code-block bases", () => {
		document.body.innerHTML = "";
		const t = toolbar(div(document.body, "block-language-base"));
		const off = installSchemaButton(app([]), vi.fn());
		expect(t.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(0);
		off();
	});
	it("re-injects after Bases emptied the toolbar", () => {
		document.body.innerHTML = "";
		const t = toolbar(div(document.body, "workspace-leaf-content"));
		const a = app([]);
		const off = installSchemaButton(a, vi.fn());
		t.innerHTML = "";
		(a.workspace as unknown as { triggerLayout(): void }).triggerLayout();
		expect(t.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		off();
	});
});
