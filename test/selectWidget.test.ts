import { describe, it, expect, vi, beforeEach } from "vitest";
import { Notice, TFile, type App } from "obsidian";
import { SelectWidget } from "../src/widgets/SelectWidget";
import { openOptionPicker, type OptionPickerHost } from "../src/widgets/OptionPicker";
import { addOptionMutation, nextOptionColor } from "../src/widgets/values";
import type { SelectField } from "../src/schema/types";
import { confirmOptionDelete } from "../src/widgets/OptionDeleteModal";
import { MEMBERS_LOADING } from "../src/schema/messages";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

vi.mock("obsidian", async (orig) => {
	const actual = await orig<typeof import("obsidian")>();
	return { ...actual, Notice: vi.fn() };
});
vi.mock("../src/widgets/OptionDeleteModal", () => ({ confirmOptionDelete: vi.fn() }));
vi.mock("../src/widgets/OptionPicker", () => ({ openOptionPicker: vi.fn(() => ({ close: vi.fn() })) }));

function setup(value: unknown, opts: { multiple?: boolean; resolved?: boolean; writeFails?: boolean; source?: { basePath: string; name: string }; files?: TFile[] | null; used?: unknown } = {}) {
	const processFrontMatter = vi.fn((_f: unknown, fn: (fm: Record<string, unknown>) => void) => {
		fn({ status: ["A", "B"] });
		return Promise.resolve();
	});
	const update = vi.fn((_path: string, _mutate: unknown) => (opts.writeFails ? Promise.reject(new Error("locked")) : Promise.resolve()));
	const env = {
		app: { fileManager: { processFrontMatter }, metadataCache: { getFileCache: () => ({ frontmatter: { status: opts.used } }) } } as unknown as App,
		writer: { update },
		membership: {
			resolveWithBase: () => (opts.resolved === false ? null : { basePath: "M.base", name: "Status" }),
			targetEntries: () => (opts.files === null ? null : (opts.files ?? [new TFile(), new TFile()] as TFile[])),
		},
		overlays: new OverlayRegistry(),
	} as unknown as WidgetEnv;
	const onChange = vi.fn();
	const ctx = { app: env.app, key: "status", sourcePath: "n.md", onChange, blur: vi.fn() } as PropertyRenderContext;
	const field: SelectField = { type: "select", multiple: opts.multiple ?? true, options: [{ value: "A", color: "red" }] };
	const el = document.body.createDiv();
	const handle = SelectWidget(el, value, ctx, field, env, opts.source);
	const root = el.querySelector<HTMLElement>(".improved-bases-select") as HTMLElement;
	const pills = () => Array.from(el.querySelectorAll(".improved-bases-pill")).map((p) => p.querySelector(".improved-bases-pill-body")?.textContent);
	const open = (): OptionPickerHost => {
		root.click();
		const call = vi.mocked(openOptionPicker).mock.calls.at(-1);
		if (!call) throw new Error("picker not opened");
		return call[1];
	};
	return { el, root, handle, onChange, update, pills, open, env, processFrontMatter };
}

beforeEach(() => {
	document.body.innerHTML = "";
	vi.mocked(openOptionPicker).mockClear();
});

describe("SelectWidget", () => {
	it("is a focusable dialog button without add and remove buttons", () => {
		const { el, root, handle } = setup(["A"]);
		expect(root.getAttribute("tabindex")).toBe("0");
		expect(root.getAttribute("role")).toBe("button");
		expect(root.getAttribute("aria-haspopup")).toBe("dialog");
		expect(el.querySelector(".improved-bases-add")).toBeNull();
		expect(el.querySelector(".improved-bases-chip-remove")).toBeNull();
		handle.focus?.();
		expect(document.activeElement).toBe(root);
	});
	it("opens the picker on click, Enter and Space", () => {
		const { root, env } = setup(["A"]);
		root.click();
		expect(openOptionPicker).toHaveBeenLastCalledWith(root, expect.any(Object), env.overlays);
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		root.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
		expect(openOptionPicker).toHaveBeenCalledTimes(3);
		root.querySelector(".improved-bases-pill")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(openOptionPicker).toHaveBeenCalledTimes(3);
	});
	it("closes the previous picker before opening another", () => {
		const close = vi.fn();
		vi.mocked(openOptionPicker).mockReturnValueOnce({ close });
		const { root } = setup(["A"]);
		root.click();
		expect(close).not.toHaveBeenCalled();
		root.click();
		expect(close).toHaveBeenCalledTimes(1);
	});
	it("hands copies of options and values to the picker", () => {
		const { open } = setup(["A", "Z"], { multiple: false });
		const host = open();
		expect(host.options).toEqual([{ value: "A", color: "red" }]);
		expect(host.values).toEqual(["A", "Z"]);
		expect(host.multiple).toBe(false);
	});
	it("flags unknown values grey", () => {
		const { el, pills } = setup(["A", "Z"]);
		expect(pills()).toEqual(["A", "Z"]);
		const z = el.querySelectorAll(".improved-bases-pill")[1];
		expect(z?.getAttribute("title")).toBe("Not in options");
		expect(z?.getAttribute("data-color")).toBe("grey");
	});
	it("commits as list for multiple and as string for single, redrawing pills", () => {
		const multi = setup(["A"]);
		multi.open().commit(["B"]);
		expect(multi.onChange).toHaveBeenCalledWith(["B"]);
		expect(multi.pills()).toEqual(["B"]);
		const single = setup("A", { multiple: false });
		single.open().commit(["B"]);
		expect(single.onChange).toHaveBeenCalledWith("B");
	});
	it("creates an option in the schema and resolves it", async () => {
		const { open, update } = setup(["A"]);
		const option = await open().create("N");
		expect(update).toHaveBeenCalledWith("M.base", expect.any(Function));
		const mutate = update.mock.calls[0]?.[1];
		expect(String(mutate)).toBe(String(addOptionMutation("Status", "N", nextOptionColor(1))));
		expect(option).toEqual({ value: "N", color: nextOptionColor(1) });
	});
	it("refuses to create a reserved name", async () => {
		const { open, update } = setup(["A"]);
		expect(await open().create("constructor")).toBeNull();
		expect(vi.mocked(Notice).mock.calls.at(-1)?.[0]).toBe("Reserved name");
		expect(update).not.toHaveBeenCalled();
	});
	it("writes options into the base the patch resolved", async () => {
		const { open, update } = setup(["A"], { source: { basePath: "Viewed.base", name: "Status" } });
		await open().create("B");
		expect(update).toHaveBeenCalledWith("Viewed.base", expect.any(Function));
	});
	it("resolves null when the schema write fails or the field is unresolved", async () => {
		const failing = setup(["A"], { writeFails: true });
		expect(await failing.open().create("N")).toBeNull();
		const unresolved = setup(["A"], { resolved: false });
		expect(await unresolved.open().create("N")).toBeNull();
		expect(unresolved.update).not.toHaveBeenCalled();
	});
	it("recolors through the schema and updates the pill", async () => {
		const { el, open, update } = setup(["A", "Z"]);
		const pill = (i: number) => el.querySelectorAll(".improved-bases-pill")[i];
		const host = open();
		expect(await host.recolor("A", "blue")).toBe(true);
		expect(update).toHaveBeenCalledTimes(1);
		expect(pill(0)?.getAttribute("data-color")).toBe("blue");
		expect(await host.recolor("Z", "green")).toBe(true);
		expect(pill(1)?.getAttribute("data-color")).toBe("green");
	});
	it("does not recolor when the write fails", async () => {
		const { el, open } = setup(["A"], { writeFails: true });
		expect(await open().recolor("A", "blue")).toBe(false);
		expect(el.querySelector(".improved-bases-pill")?.getAttribute("data-color")).toBe("red");
	});
	describe("rename", () => {
		const lastNotice = () => vi.mocked(Notice).mock.calls.at(-1)?.[0];
		it("refuses an existing option name without writing", async () => {
			const { open, update, processFrontMatter } = setup(["A"]);
			expect(await open().rename("A", "A")).toBe(false);
			expect(lastNotice()).toBe("Option exists");
			expect(update).not.toHaveBeenCalled();
			expect(processFrontMatter).not.toHaveBeenCalled();
		});
		it("refuses reserved names without writing", async () => {
			const { open, update } = setup(["A"]);
			expect(await open().rename("A", "__proto__")).toBe(false);
			expect(lastNotice()).toBe("Reserved name");
			expect(update).not.toHaveBeenCalled();
		});
		it("skips the migration and tells when the schema rename did not apply", async () => {
			const { open, update, processFrontMatter, pills } = setup(["A"]);
			update.mockImplementationOnce((_p: string, mutate: unknown) => {
				(mutate as (f: Record<string, unknown>) => void)({ Status: { type: "select", options: { B: "red" } } });
				return Promise.resolve();
			});
			expect(await open().rename("A", "Z")).toBe(false);
			expect(lastNotice()).toBe("Option changed elsewhere, reopen the picker");
			expect(processFrontMatter).not.toHaveBeenCalled();
			expect(pills()).toEqual(["A"]);
		});
		it("writes nothing while the members are unknown", async () => {
			const { open, update, processFrontMatter } = setup(["A"], { files: null });
			expect(await open().rename("A", "Z")).toBe(false);
			expect(update).not.toHaveBeenCalled();
			expect(processFrontMatter).not.toHaveBeenCalled();
			expect(lastNotice()).toBe(MEMBERS_LOADING);
		});
		it("does nothing without a source", async () => {
			const { open, update } = setup(["A"], { resolved: false });
			expect(await open().rename("A", "Z")).toBe(false);
			expect(update).not.toHaveBeenCalled();
		});
		it("stops when the schema write fails", async () => {
			const { open, processFrontMatter, pills } = setup(["A"], { writeFails: true });
			expect(await open().rename("A", "Z")).toBe(false);
			expect(processFrontMatter).not.toHaveBeenCalled();
			expect(pills()).toEqual(["A"]);
		});
		it("writes the schema, migrates the notes, reports and redraws", async () => {
			const { open, update, processFrontMatter, pills } = setup(["A"], { used: "A" });
			expect(await open().rename("A", "Z")).toBe(true);
			expect(update).toHaveBeenCalledWith("M.base", expect.any(Function));
			expect(processFrontMatter).toHaveBeenCalledTimes(2);
			expect(lastNotice()).toBe("Renamed in 2 notes");
			expect(pills()).toEqual(["Z"]);
		});
		it("uses the singular and reports failures", async () => {
			const one = setup(["A"], { used: "A", files: [new TFile()] });
			await one.open().rename("A", "Z");
			expect(lastNotice()).toBe("Renamed in 1 note");
			const bad = setup(["A"], { used: "A" });
			bad.processFrontMatter.mockRejectedValueOnce(new Error("x"));
			await bad.open().rename("A", "Z");
			expect(lastNotice()).toBe("Renamed in 1 note, 1 failed");
		});
	});
	describe("remove", () => {
		const lastNotice = () => vi.mocked(Notice).mock.calls.at(-1)?.[0];
		beforeEach(() => vi.mocked(confirmOptionDelete).mockReset());
		it("writes only the schema without asking when no note uses the option", async () => {
			const { open, update, processFrontMatter } = setup(["A"], { used: ["B"] });
			expect(await open().remove("A")).toBe(true);
			expect(confirmOptionDelete).not.toHaveBeenCalled();
			expect(update).toHaveBeenCalledTimes(1);
			expect(processFrontMatter).not.toHaveBeenCalled();
		});
		it("fails without a source or when the schema write fails", async () => {
			expect(await setup(["A"], { resolved: false }).open().remove("A")).toBe(false);
			expect(await setup(["A"], { writeFails: true }).open().remove("A")).toBe(false);
		});
		it("writes nothing while the members are unknown", async () => {
			const { open, update } = setup(["A"], { files: null });
			expect(await open().remove("A")).toBe(false);
			expect(update).not.toHaveBeenCalled();
			expect(lastNotice()).toBe(MEMBERS_LOADING);
		});
		it("removes from the notes and the pills on 'notes'", async () => {
			vi.mocked(confirmOptionDelete).mockResolvedValue("notes");
			const { open, update, processFrontMatter, pills, env } = setup(["A", "B"], { used: ["A"] });
			const h = open();
			expect(await h.remove("A")).toBe(true);
			expect(confirmOptionDelete).toHaveBeenCalledWith(env.app, "A", 2, env.overlays);
			expect(update).toHaveBeenCalledTimes(1);
			expect(processFrontMatter).toHaveBeenCalledTimes(2);
			expect(lastNotice()).toBe("Removed from 2 notes");
			expect(pills()).toEqual(["B"]);
			expect(h.values).toEqual(["B"]);
		});
		it("uses the singular and reports failures", async () => {
			vi.mocked(confirmOptionDelete).mockResolvedValue("notes");
			const bad = setup(["A"], { used: "A", files: [new TFile()] });
			bad.processFrontMatter.mockRejectedValueOnce(new Error("x"));
			await bad.open().remove("A");
			expect(lastNotice()).toBe("Removed from 0 notes, 1 failed");
			const one = setup(["A"], { used: "A", files: [new TFile()] });
			await one.open().remove("A");
			expect(lastNotice()).toBe("Removed from 1 note");
		});
		it("keeps the value as a grey pill on 'schema'", async () => {
			vi.mocked(confirmOptionDelete).mockResolvedValue("schema");
			const { open, update, processFrontMatter, pills, el } = setup(["A"], { used: ["A"] });
			const h = open();
			expect(await h.remove("A")).toBe(true);
			expect(update).toHaveBeenCalledTimes(1);
			expect(processFrontMatter).not.toHaveBeenCalled();
			expect(pills()).toEqual(["A"]);
			expect(h.values).toEqual(["A"]);
			expect(el.querySelector(".improved-bases-pill")?.getAttribute("title")).toBe("Not in options");
		});
		it("writes nothing on cancel", async () => {
			vi.mocked(confirmOptionDelete).mockResolvedValue(null);
			const { open, update, processFrontMatter, pills } = setup(["A"], { used: ["A"] });
			expect(await open().remove("A")).toBe(false);
			expect(update).not.toHaveBeenCalled();
			expect(processFrontMatter).not.toHaveBeenCalled();
			expect(pills()).toEqual(["A"]);
		});
	});
});
