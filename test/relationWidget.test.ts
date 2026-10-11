import { describe, it, expect, vi, beforeEach } from "vitest";
import { TFile, type App } from "obsidian";
import { RelationWidget } from "../src/widgets/RelationWidget";
import { EntryPicker } from "../src/widgets/pickers";
import type { PickerItem } from "../src/widgets/pickers";
import type { RelationField } from "../src/schema/types";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

vi.mock("../src/widgets/pickers", () => ({
	EntryPicker: vi.fn(function (this: { open: () => void }) {
		this.open = vi.fn();
	}),
}));

const tfile = (path: string): TFile => Object.assign(new TFile(), { path, extension: "md" });

function setup(value: unknown, opts: { multiple?: boolean; members?: TFile[] | null; baseExists?: boolean; icons?: Record<string, string>; icon?: string } = {}) {
	const members = opts.members === undefined ? [tfile("Teams/A.md")] : opts.members;
	const files: Record<string, TFile> = { "Teams/A.md": tfile("Teams/A.md"), "Other/B.md": tfile("Other/B.md") };
	const app = {
		vault: { getAbstractFileByPath: (p: string) => (opts.baseExists === false ? null : Object.assign(new TFile(), { path: p })) },
		metadataCache: {
			getFirstLinkpathDest: (link: string) =>
				Object.values(files).find((f) => f.path === `${link}.md` || f.path.endsWith(`/${link}.md`)) ?? null,
			getFileCache: (f: TFile) => (opts.icons?.[f.path] ? { frontmatter: { icon: opts.icons[f.path] } } : null),
			fileToLinktext: (f: TFile) => f.path.replace(/\.md$/, ""),
		},
		renderContext: {},
	} as unknown as App;
	const env = { app, membership: { targetEntries: () => members }, overlays: new OverlayRegistry(), writer: {} } as unknown as WidgetEnv;
	const onChange = vi.fn();
	const ctx = { app, key: "lead", sourcePath: "n.md", onChange, blur: vi.fn() } as PropertyRenderContext;
	const field: RelationField = { type: "relation", base: "Teams.base", multiple: opts.multiple ?? true, ...(opts.icon ? { icon: opts.icon } : {}) };
	const el = document.body.createDiv();
	const handle = RelationWidget(el, value, ctx, field, env);
	return { el, onChange, handle, chips: () => Array.from(el.querySelectorAll(".improved-bases-chip")) };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(EntryPicker).mockClear();
});

describe("RelationWidget", () => {
	it("renders chips with icon and link, no remove button, no add button", () => {
		const { el, chips } = setup(["[[A]]", "[[B]]", "plain"], { icons: { "Teams/A.md": "👤" }, icon: "👥" });
		expect(chips().map((c) => c.querySelector(".improved-bases-icon")?.textContent)).toEqual(["👤", "👥", "👥"]);
		expect(chips().map((c) => c.querySelector(".improved-bases-chip-body")?.textContent)).toEqual(["[[A]]", "[[B]]", "plain"]);
		expect(chips().map((c) => c.classList.contains("is-foreign"))).toEqual([false, true, true]);
		expect(el.querySelector(".improved-bases-chip-remove, .improved-bases-add")).toBeNull();
	});
	it("falls back to 📄 without a field icon", () => {
		const { chips } = setup(["[[A]]"]);
		expect(chips()[0]?.querySelector(".improved-bases-icon")?.textContent).toBe("📄");
	});
	it("marks nothing foreign while members are unknown and shows a scalar in a multiple field like any value", () => {
		const { el, chips, onChange } = setup("[[B]]", { members: null, multiple: true });
		expect(chips()[0]?.classList.contains("is-foreign")).toBe(false);
		expect(el.querySelector(".is-mismatch")).toBeNull();
		expect(el.querySelector<HTMLElement>(".improved-bases-relation")?.getAttribute("style")).toBeNull();
		// The next edit writes the schema shape.
		el.querySelector<HTMLElement>(".improved-bases-relation")!.click();
		const [, items, , onToggle] = vi.mocked(EntryPicker).mock.calls[0]! as unknown as [App, PickerItem[], unknown, (i: PickerItem) => void];
		onToggle(items[0]!);
		expect(onChange).toHaveBeenLastCalledWith([]);
	});
	it("opens the picker on field click, Enter and Space, but leaves link clicks to the link", () => {
		const { el, handle } = setup(["[[A]]"]);
		const root = el.querySelector<HTMLElement>(".improved-bases-relation")!;
		handle.focus();
		expect(document.activeElement).toBe(root);
		root.click();
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		root.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		expect(EntryPicker).toHaveBeenCalledTimes(3);
		expect(root.getAttribute("aria-haspopup")).toBe("dialog");
		// Clicks and keys on a link (wikilinks render as span.internal-link, markdown links as a) stay native.
		const body = root.querySelector<HTMLElement>(".improved-bases-chip-body")!;
		const link = body.createSpan({ cls: "internal-link" });
		const seenByLink = vi.fn();
		link.addEventListener("click", seenByLink);
		const plain = new MouseEvent("click", { bubbles: true, cancelable: true });
		link.dispatchEvent(plain);
		body.createEl("a").click();
		link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(EntryPicker).toHaveBeenCalledTimes(3);
		expect(plain.defaultPrevented).toBe(false);
		expect(seenByLink).toHaveBeenCalledTimes(1);
	});
	it("builds items with active entries first and toggles them", () => {
		const { onChange } = setup(["[[Other/B]]", "plain"], { members: [tfile("Teams/A.md"), tfile("Other/B.md")] });
		document.querySelector<HTMLElement>(".improved-bases-relation")!.click();
		const [, items, , onToggle] = vi.mocked(EntryPicker).mock.calls[0]! as unknown as [App, PickerItem[], unknown, (i: PickerItem) => void];
		expect(items.map((i) => [i.raw, i.active, i.foreign])).toEqual([
			["[[Other/B]]", true, false],
			["plain", true, true],
			["[[Teams/A]]", false, false],
		]);
		onToggle(items[2]!);
		expect(onChange).toHaveBeenLastCalledWith(["[[Other/B]]", "plain", "[[Teams/A]]"]);
		expect(items[2]!.active).toBe(true);
		onToggle(items[1]!);
		expect(onChange).toHaveBeenLastCalledWith(["[[Other/B]]", "[[Teams/A]]"]);
	});
	it("behaves like a radio for single relations", () => {
		const { onChange } = setup("[[Teams/A]]", { multiple: false, members: [tfile("Teams/A.md"), tfile("Other/B.md")] });
		document.querySelector<HTMLElement>(".improved-bases-relation")!.click();
		const [, items, , onToggle] = vi.mocked(EntryPicker).mock.calls[0]! as unknown as [App, PickerItem[], unknown, (i: PickerItem) => void];
		onToggle(items[1]!);
		expect(onChange).toHaveBeenLastCalledWith("[[Other/B]]");
		expect(items.map((i) => i.active)).toEqual([false, true]);
		onToggle(items[1]!);
		expect(onChange).toHaveBeenLastCalledWith(null);
	});
	it("refuses to pick when the target base is missing", () => {
		const { el } = setup([], { baseExists: false });
		el.querySelector<HTMLElement>(".improved-bases-relation")?.click();
		expect(EntryPicker).not.toHaveBeenCalled();
	});
});
