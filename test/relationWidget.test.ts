import { describe, it, expect, vi, beforeEach } from "vitest";
import { TFile, type App } from "obsidian";
import { RelationWidget } from "../src/widgets/RelationWidget";
import { EntryPicker } from "../src/widgets/pickers";
import type { RelationField } from "../src/schema/types";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

vi.mock("../src/widgets/pickers", () => ({
	EntryPicker: vi.fn(function (this: { open: () => void }) {
		this.open = vi.fn();
	}),
}));

const tfile = (path: string): TFile => Object.assign(new TFile(), { path, extension: "md" });

function setup(value: unknown, opts: { multiple?: boolean; members?: TFile[] | null; baseExists?: boolean } = {}) {
	const members = opts.members === undefined ? [tfile("Teams/A.md")] : opts.members;
	const files: Record<string, TFile> = { "Teams/A.md": tfile("Teams/A.md"), "Other/B.md": tfile("Other/B.md") };
	const app = {
		vault: { getAbstractFileByPath: (p: string) => (opts.baseExists === false ? null : Object.assign(new TFile(), { path: p })) },
		metadataCache: {
			getFirstLinkpathDest: (link: string) => Object.values(files).find((f) => f.path.endsWith(`/${link}.md`)) ?? null,
			fileToLinktext: (f: TFile) => f.path.replace(/\.md$/, ""),
		},
		renderContext: {},
	} as unknown as App;
	const env = { app, membership: { targetEntries: () => members }, overlays: new OverlayRegistry(), writer: {} } as unknown as WidgetEnv;
	const onChange = vi.fn();
	const ctx = { app, key: "lead", sourcePath: "n.md", onChange, blur: vi.fn() } as PropertyRenderContext;
	const field: RelationField = { type: "relation", base: "Teams.base", multiple: opts.multiple ?? true };
	const el = document.body.createDiv();
	const handle = RelationWidget(el, value, ctx, field, env);
	return { el, onChange, handle, chips: () => Array.from(el.querySelectorAll(".improved-bases-chip")) };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(EntryPicker).mockClear();
});

describe("RelationWidget", () => {
	it("renders chips, marks links outside the target base, and removes on click", () => {
		const { el, onChange, chips } = setup(["[[A]]", "[[B]]", "plain"]);
		expect(chips().map((c) => c.textContent)).toEqual(["[[A]]×", "[[B]]×", "plain×"]);
		expect(chips().map((c) => c.classList.contains("is-foreign"))).toEqual([false, true, true]);
		expect(el.querySelector(".is-mismatch")).toBeNull();
		chips()[1]?.querySelector<HTMLElement>(".improved-bases-chip-remove")?.click();
		expect(onChange).toHaveBeenCalledWith(["[[A]]", "plain"]);
		expect(chips()).toHaveLength(2);
	});
	it("marks nothing foreign while members are unknown and flags shape mismatches", () => {
		const { el, chips } = setup("[[B]]", { members: null, multiple: true });
		expect(chips()[0]?.classList.contains("is-foreign")).toBe(false);
		expect(el.querySelector(".is-mismatch")).not.toBeNull();
	});
	it("adds picked entries through the picker", () => {
		const { el, onChange, handle } = setup(["[[Teams/A]]"], { multiple: true });
		handle.focus();
		el.querySelector<HTMLElement>(".improved-bases-add")?.click();
		const onPick = vi.mocked(EntryPicker).mock.calls[0]?.[2] as (f: TFile) => void;
		onPick(tfile("Teams/A.md"));
		expect(onChange).not.toHaveBeenCalled();
		onPick(tfile("Other/B.md"));
		expect(onChange).toHaveBeenCalledWith(["[[Teams/A]]", "[[Other/B]]"]);
		const single = setup("[[Teams/A]]", { multiple: false });
		single.el.querySelector<HTMLElement>(".improved-bases-add")?.click();
		(vi.mocked(EntryPicker).mock.calls[1]?.[2] as (f: TFile) => void)(tfile("Other/B.md"));
		expect(single.onChange).toHaveBeenCalledWith("[[Other/B]]");
	});
	it("refuses to pick when the target base is missing", () => {
		const { el } = setup([], { baseExists: false });
		el.querySelector<HTMLElement>(".improved-bases-add")?.click();
		expect(EntryPicker).not.toHaveBeenCalled();
	});
});
