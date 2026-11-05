import { describe, it, expect, vi, beforeEach } from "vitest";
import { Events, Notice, Platform, TFile, type App, type PluginManifest } from "obsidian";
import { installTypeInfoPatch, type TypeInfoPatch } from "../src/internals/typeInfoPatch";
import { installHeaderTypeChange } from "../src/internals/headerTypeChange";
import ImprovedBasesPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

vi.mock("obsidian", async (orig) => ({ ...(await orig<typeof import("obsidian")>()), Notice: vi.fn() }));
vi.mock("../src/internals/typeInfoPatch", () => ({ installTypeInfoPatch: vi.fn() }));
vi.mock("../src/internals/headerTypeChange", () => ({ installHeaderTypeChange: vi.fn() }));

const install = vi.mocked(installTypeInfoPatch);
const installHeader = vi.mocked(installHeaderTypeChange);

const stub = (type: string) => ({ type, validate: () => true, render: () => undefined });

function plugin(registered: Record<string, unknown> = {}, types: Record<string, string> = {}) {
	const mtm = { registeredTypeWidgets: { text: stub("text"), ...registered } as Record<string, unknown>, getTypeInfo: vi.fn(), trigger: vi.fn(), assignedWidgets: Object.fromEntries(Object.entries(types).map(([name, widget]) => [name.toLowerCase(), { name, widget }])) };
	const handlers = new Map<string, (win: { doc: Document }) => void>();
	const popout = document.implementation.createHTMLDocument();
	const workspace = {
		iterateAllLeaves: (cb: (leaf: unknown) => void) => [document, popout, popout].forEach((doc) => cb({ view: { containerEl: { ownerDocument: doc } } })),
		on: vi.fn((name: string, cb: (win: { doc: Document }) => void) => (handlers.set(name, cb), { name })),
		offref: vi.fn(),
	};
	const app = { metadataTypeManager: mtm, workspace } as unknown as App;
	const p = new ImprovedBasesPlugin(app, { name: "Improved Bases" } as PluginManifest);
	Object.assign(p, { app, manifest: { name: "Improved Bases" } });
	p.settings = { ...DEFAULT_SETTINGS };
	(p as unknown as { env: unknown }).env = {};
	p.registry = { schemas: () => [] } as never;
	return { p, mtm, workspace, handlers, popout };
}

const hookStub = () => ({ attach: vi.fn(), detach: vi.fn(), pending: () => null, menuBase: () => null, uninstall: vi.fn() });

beforeEach(() => {
	install.mockReset();
	installHeader.mockReset();
	vi.mocked(Notice).mockClear();
});

describe("enableWidgets / disableWidgets", () => {
	it("installs the patch once and removes it when disabled", () => {
		const uninstall = vi.fn();
		install.mockReturnValue({ uninstall } as unknown as TypeInfoPatch);
		const { p } = plugin();
		p.enableWidgets();
		p.enableWidgets();
		expect(install).toHaveBeenCalledTimes(1);
		p.disableWidgets();
		expect(uninstall).toHaveBeenCalledTimes(1);
		expect(p.typeInfoPatch).toBeNull();
		p.disableWidgets();
		expect(uninstall).toHaveBeenCalledTimes(1);
	});
	it("marks widgets unsupported when the patch cannot be installed", () => {
		install.mockReturnValue(null);
		const { p } = plugin();
		p.enableWidgets();
		expect(p.widgetsSupported).toBe(false);
		expect(p.warnings.list().map((w) => w.id)).toEqual(["plugin:unsupported"]);
		expect(Notice).toHaveBeenCalledWith("Improved Bases: this Obsidian version is not supported (see warnings)");
	});
	it("registers select/relation while on, removes them when off and refreshes affected fields", () => {
		const order: string[] = [];
		const uninstallPatch = vi.fn(() => order.push("patch"));
		const uninstallHeader = vi.fn(() => order.push("header"));
		install.mockReturnValue({ uninstall: uninstallPatch } as unknown as TypeInfoPatch);
		installHeader.mockReturnValue({ ...hookStub(), uninstall: uninstallHeader });
		const { p, mtm } = plugin({}, { lead: "select", team: "relation", name: "text" });
		p.enableWidgets();
		expect(mtm.registeredTypeWidgets.select).toBeDefined();
		expect(mtm.registeredTypeWidgets.relation).toBeDefined();
		expect(installHeader).toHaveBeenCalledTimes(1);
		expect(install.mock.calls[0]![3]).toHaveProperty("menuBase");
		const changedOnEnable = mtm.trigger.mock.calls.filter((c) => c[0] === "changed").map((c): unknown => c[1]);
		expect(changedOnEnable.sort()).toEqual(["lead", "team"]);
		mtm.trigger.mockClear();
		p.disableWidgets();
		expect(order).toEqual(["header", "patch"]);
		expect(mtm.registeredTypeWidgets.select).toBeUndefined();
		expect(mtm.registeredTypeWidgets.relation).toBeUndefined();
		const changed = mtm.trigger.mock.calls.filter((c) => c[0] === "changed").map((c): unknown => c[1]);
		expect(changed.sort()).toEqual(["lead", "team"]);
	});
	it("attaches the header hook to the main window and every popout, and follows window events", () => {
		install.mockReturnValue({ uninstall: vi.fn() } as unknown as TypeInfoPatch);
		const hook = hookStub();
		installHeader.mockReturnValue(hook);
		const { p, workspace, handlers, popout } = plugin();
		p.enableWidgets();
		expect(hook.attach.mock.calls.map((c): unknown => c[0])).toEqual([document, popout]);
		const next = document.implementation.createHTMLDocument();
		handlers.get("window-open")!({ doc: next });
		expect(hook.attach).toHaveBeenLastCalledWith(next);
		handlers.get("window-close")!({ doc: next });
		expect(hook.detach).toHaveBeenCalledWith(next);
		p.disableWidgets();
		expect(workspace.offref).toHaveBeenCalledTimes(2);
	});
	it("skips ids registered by another plugin with one notice", () => {
		install.mockReturnValue({ uninstall: vi.fn() } as unknown as TypeInfoPatch);
		installHeader.mockReturnValue(hookStub());
		const foreign = stub("select");
		const { p, mtm } = plugin({ select: foreign });
		p.enableWidgets();
		expect(mtm.registeredTypeWidgets.select).toBe(foreign);
		expect(Notice).toHaveBeenCalledTimes(1);
		expect(Notice).toHaveBeenCalledWith('Improved Bases: property type "select" is already registered by another plugin (see warnings)');
		expect(p.warnings.list().map((w) => w.id)).toEqual(["plugin:typeTaken:select"]);
		expect([...installHeader.mock.calls[0]![1].pluginTypes()]).toEqual(["relation"]);
		p.disableWidgets();
		expect(mtm.registeredTypeWidgets.select).toBe(foreign);
		p.enableWidgets();
		expect(Notice).toHaveBeenCalledTimes(1);
	});
});

describe("warning access points", () => {
	function wired() {
		const { p, mtm, workspace } = plugin();
		const commands: Record<string, { callback?: () => void }> = {};
		const statusItems: HTMLElement[] = [];
		const vaultHandlers = new Map<string, (f: unknown) => void>();
		Object.assign(p, {
			addCommand: (cmd: { id: string; callback?: () => void }) => (commands[cmd.id] = cmd),
			addStatusBarItem: () => {
				const el = document.body.createDiv();
				statusItems.push(el);
				return el;
			},
			registerEvent: vi.fn(),
		});
		const registry = new Events() as Events & { errors: () => Map<string, string[]>; schemas: () => unknown[] };
		registry.errors = () => new Map();
		registry.schemas = () => [];
		const membership = new Events() as Events & { conflicts: () => unknown[]; knownFieldNames: () => Set<string> };
		membership.conflicts = () => [];
		membership.knownFieldNames = () => new Set(["team"]);
		const app = { ...(p.app as object), metadataTypeManager: mtm, workspace, vault: { on: vi.fn((name: string, cb: (f: unknown) => void) => (vaultHandlers.set(name, cb), { name })), getAbstractFileByPath: () => null } } as unknown as App;
		Object.assign(p, { app, registry, membership });
		return { p, commands, statusItems, registry, membership, vaultHandlers };
	}
	it("registers the command and a status bar item that follows the count and opens the list", () => {
		const { p, commands, statusItems } = wired();
		p.registerWarningAccess();
		const item = statusItems[0]!;
		expect(item.classList.contains("is-hidden")).toBe(true);
		p.warnings.report("x", { text: "boom" });
		expect(item.classList.contains("is-hidden")).toBe(false);
		expect(item.querySelector(".improved-bases-status-count")?.textContent).toBe("1");
		expect(item.getAttribute("aria-label")).toBe("1 warning");
		item.click();
		expect(document.querySelector(".improved-bases-warnings-modal")).not.toBeNull();
		expect(document.querySelectorAll(".improved-bases-warning")).toHaveLength(1);
		expect(commands["show-warnings"]?.callback).toBeTypeOf("function");
		p.unload();
		expect(document.querySelector(".improved-bases-warnings-modal")).toBeNull();
		p.warnings.resolve("x");
		expect(item.classList.contains("is-hidden")).toBe(false);
	});
	it("adds no status bar item on mobile", () => {
		const { p, statusItems, commands } = wired();
		Platform.isDesktop = false;
		try {
			p.registerWarningAccess();
		} finally {
			Platform.isDesktop = true;
		}
		expect(statusItems).toHaveLength(0);
		expect(commands["show-warnings"]).toBeDefined();
	});
	it("derives schema, conflict and relation warnings from registry, membership and base file events", async () => {
		vi.useFakeTimers();
		const { p, registry, membership, vaultHandlers } = wired();
		p.watchWarningSources();
		registry.errors = () => new Map([["A.base", ["bad"]]]);
		registry.schemas = () => [{ basePath: "A.base", fields: new Map([["team", { name: "Team", field: { type: "relation", base: "Gone.base", multiple: true } }]]) }];
		registry.trigger("changed");
		expect(p.warnings.list().map((w) => w.id)).toEqual(["schema:A.base"]);
		await vi.advanceTimersByTimeAsync(300);
		expect(p.warnings.list().map((w) => w.id).sort()).toEqual(["relation:A.base:team", "schema:A.base"]);
		membership.conflicts = () => [{ name: "Team", bases: ["A.base", "B.base"], files: 2 }];
		membership.trigger("changed", ["team"]);
		expect(p.warnings.list().some((w) => w.id.startsWith("conflict:"))).toBe(true);
		registry.schemas = () => [];
		const base = Object.assign(new TFile(), { extension: "base", path: "Gone.base" });
		vaultHandlers.get("create")!(base);
		vaultHandlers.get("modify")!(Object.assign(new TFile(), { extension: "md", path: "n.md" }));
		await vi.advanceTimersByTimeAsync(300);
		expect(p.warnings.list().some((w) => w.id.startsWith("relation:"))).toBe(false);
		vi.useRealTimers();
	});
	it("re-renders plugin fields when the conflict marker toggle flips", () => {
		const { p, membership } = wired();
		const refresh = vi.fn();
		p.typeInfoPatch = { refresh, uninstall: vi.fn() };
		Object.assign(p, { schemaSettings: { setToolbarButton: vi.fn(), open: vi.fn() } });
		p.applySettings();
		expect(refresh).not.toHaveBeenCalled();
		p.settings = { ...p.settings, showConflictMarkers: false };
		p.applySettings();
		expect(refresh).toHaveBeenCalledWith([...membership.knownFieldNames()]);
		p.applySettings();
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
