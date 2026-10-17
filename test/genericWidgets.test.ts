import { describe, it, expect, vi, beforeEach } from "vitest";
import { TFile, type App } from "obsidian";
import { createGenericSelectWidget } from "../src/widgets/GenericSelectWidget";
import { createGenericRelationWidget } from "../src/widgets/GenericRelationWidget";
import { openOptionPicker } from "../src/widgets/OptionPicker";
import { EntryPicker, type PickerItem } from "../src/widgets/pickers";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

vi.mock("obsidian", async (orig) => ({ ...(await orig<Record<string, unknown>>()), Notice: vi.fn() }));
vi.mock("../src/widgets/OptionPicker", () => ({ openOptionPicker: vi.fn(() => ({ close: vi.fn() })) }));
vi.mock("../src/widgets/pickers", () => ({
	EntryPicker: vi.fn(function (this: { open: () => void }) {
		this.open = vi.fn();
	}),
}));

const tfile = (path: string): TFile => Object.assign(new TFile(), { path, basename: path.replace(/^.*\//, "").replace(/\.md$/, ""), extension: "md" });
const FILES = [tfile("A.md"), tfile("Sub/B.md")];
const FM: Record<string, Record<string, unknown>> = { "A.md": { status: ["x", "y"] }, "Sub/B.md": { status: "x" } };

function setup(make: typeof createGenericSelectWidget, value: unknown) {
	const getMarkdownFiles = vi.fn(() => FILES);
	const getFileCache = vi.fn((f: TFile) => ({ frontmatter: FM[f.path] }));
	const app = {
		vault: { getMarkdownFiles },
		metadataCache: {
			getFileCache,
			getFirstLinkpathDest: (l: string) => FILES.find((f) => f.basename === l) ?? null,
			fileToLinktext: (f: TFile) => f.path.replace(/\.md$/, ""),
		},
		renderContext: {},
	} as unknown as App;
	const env = { app, overlays: new OverlayRegistry() } as unknown as WidgetEnv;
	const onChange = vi.fn();
	const ctx = { app, key: "status", sourcePath: "n.md", onChange, blur: vi.fn() } as PropertyRenderContext;
	const widget = make(env);
	const el = document.body.createDiv();
	const handle = widget.render(el, value, ctx) as { type: string };
	return { widget, el, onChange, handle, getMarkdownFiles, getFileCache, env };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(openOptionPicker).mockClear();
	vi.mocked(EntryPicker).mockClear();
});

describe("generic select widget", () => {
	it("is registered as select with a function name and renders neutral pills without scanning the vault", () => {
		const { widget, el, getMarkdownFiles, getFileCache, handle } = setup(createGenericSelectWidget, ["x", "q"]);
		expect(widget.type).toBe("select");
		expect(handle.type).toBe("select");
		expect((widget.name as () => string)()).toBe("Select");
		const pills = Array.from(el.querySelectorAll(".improved-bases-pill"));
		expect(pills.map((p) => p.textContent)).toEqual(["x", "q"]);
		expect(pills.every((p) => p.classList.contains("is-neutral") && !p.hasAttribute("data-color"))).toBe(true);
		expect(getMarkdownFiles).not.toHaveBeenCalled();
		expect(getFileCache).not.toHaveBeenCalled();
	});
	it("collects vault values only when the picker opens, with a host without edit actions", () => {
		const { el, getMarkdownFiles } = setup(createGenericSelectWidget, ["q"]);
		el.querySelector<HTMLElement>(".improved-bases-select")!.click();
		expect(getMarkdownFiles).toHaveBeenCalledTimes(1);
		const host = vi.mocked(openOptionPicker).mock.calls[0]![1];
		expect(host.options.map((o) => o.value)).toEqual(["x", "y", "q"]);
		expect([host.recolor, host.rename, host.remove]).toEqual([undefined, undefined, undefined]);
		expect(host.multiple).toBe(true);
	});
	it("commits a string for single and a list for multiple, and create only returns the option", async () => {
		const single = setup(createGenericSelectWidget, "x");
		single.el.querySelector<HTMLElement>(".improved-bases-select")!.click();
		const h1 = vi.mocked(openOptionPicker).mock.calls[0]![1];
		h1.commit(["y"]);
		expect(single.onChange).toHaveBeenLastCalledWith("y");
		expect(single.el.textContent).toBe("y");
		const multi = setup(createGenericSelectWidget, ["x"]);
		multi.el.querySelector<HTMLElement>(".improved-bases-select")!.click();
		const h2 = vi.mocked(openOptionPicker).mock.calls[1]![1];
		expect(h2.multiple).toBe(true);
		h2.commit(["x", "z"]);
		expect(multi.onChange).toHaveBeenLastCalledWith(["x", "z"]);
		expect(await h2.create("new")).toEqual({ value: "new", color: "grey" });
		expect(await h2.create("__proto__")).toBeNull();
		expect(multi.onChange).toHaveBeenCalledTimes(1);
	});
	it("an empty value is multiple when the vault stores a list", () => {
		const { el } = setup(createGenericSelectWidget, null);
		el.querySelector<HTMLElement>(".improved-bases-select")!.click();
		expect((vi.mocked(openOptionPicker).mock.calls[0]![1]).multiple).toBe(true);
	});
});

describe("generic relation widget", () => {
	const open = (value: unknown) => {
		const s = setup(createGenericRelationWidget, value);
		s.el.querySelector<HTMLElement>(".improved-bases-relation")!.click();
		const [, items, , onToggle] = vi.mocked(EntryPicker).mock.calls[0]! as unknown as [App, PickerItem[], unknown, (i: PickerItem) => void];
		return { ...s, items, onToggle };
	};
	it("is registered as relation with a function name", () => {
		const { widget, handle } = setup(createGenericRelationWidget, null);
		expect(widget.type).toBe("relation");
		expect(handle.type).toBe("relation");
		expect((widget.name as () => string)()).toBe("Relation");
	});
	it("lists all markdown notes and writes link values", () => {
		const { items, onToggle, onChange } = open(["[[A]]"]);
		expect(items.map((i) => i.raw)).toEqual(["[[A]]", "[[Sub/B]]"]);
		onToggle(items[1]!);
		expect(onChange).toHaveBeenLastCalledWith(["[[A]]", "[[Sub/B]]"]);
		onToggle(items[0]!);
		expect(onChange).toHaveBeenLastCalledWith(["[[Sub/B]]"]);
	});
	it("acts as a radio for a single value and clears on uncheck", () => {
		const { items, onToggle, onChange } = open("[[A]]");
		onToggle(items[1]!);
		expect(onChange).toHaveBeenLastCalledWith("[[Sub/B]]");
		onToggle(items[1]!);
		expect(onChange).toHaveBeenLastCalledWith(null);
	});
});
