import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { installSchemaButton, resolveBasePath, TOOLBAR_MARK } from "../src/internals/toolbar";

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

describe("resolveBasePath", () => {
	it("resolves a bases leaf", () => {
		const c = document.createElement("div");
		const t = toolbar(c);
		expect(resolveBasePath(app([leaf(c, "bases", "A.base")]), t)).toBe("A.base");
	});
	it("resolves an embed through the containing note", () => {
		const c = document.createElement("div");
		const e = div(c, "internal-embed", { src: "Mitarbeiter.base#x" });
		const t = toolbar(e);
		const a = app([leaf(c, "markdown", "Notizen/N.md")], { "Mitarbeiter.base": { path: "Mitarbeiter.base", extension: "base" } });
		expect(resolveBasePath(a, t)).toBe("Mitarbeiter.base");
	});
	it("returns null for code-block bases and non-base embeds", () => {
		const c = document.createElement("div");
		const t = toolbar(div(c, "block-language-base"));
		expect(resolveBasePath(app([leaf(c, "markdown", "N.md")]), t)).toBeNull();
		const e = div(c, "internal-embed", { src: "X" });
		const t2 = toolbar(e);
		expect(resolveBasePath(app([leaf(c, "markdown", "N.md")], { X: { path: "X.md", extension: "md" } }), t2)).toBeNull();
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
		const onOpen = vi.fn();
		const a = app([leaf(c, "bases", "A.base")]);
		const off = installSchemaButton(a, onOpen);
		expect(t1.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		(a.workspace as unknown as { triggerLayout(): void }).triggerLayout();
		expect(t1.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		const c2 = div(document.body, "workspace-leaf-content");
		const t2 = toolbar(c2);
		await new Promise((r) => setTimeout(r, 0));
		expect(t2.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(1);
		(t1.querySelector(".improved-bases-toolbar-item") as HTMLElement).click();
		expect(onOpen).toHaveBeenCalledWith("A.base");
		off();
		expect((a.workspace as unknown as { offref: ReturnType<typeof vi.fn> }).offref).toHaveBeenCalled();
		expect(document.querySelectorAll(".improved-bases-toolbar-item")).toHaveLength(0);
		expect(document.querySelectorAll(`.${TOOLBAR_MARK}`)).toHaveLength(0);
	});
});
