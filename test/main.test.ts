import { describe, it, expect, vi, beforeEach } from "vitest";
import { Notice, type App, type PluginManifest } from "obsidian";
import { installTypeInfoPatch, type TypeInfoPatch } from "../src/internals/typeInfoPatch";
import { installHeaderTypeChange } from "../src/internals/headerTypeChange";
import ImprovedBasesPlugin from "../src/main";

vi.mock("obsidian", async (orig) => ({ ...(await orig<typeof import("obsidian")>()), Notice: vi.fn() }));
vi.mock("../src/internals/typeInfoPatch", () => ({ installTypeInfoPatch: vi.fn() }));
vi.mock("../src/internals/headerTypeChange", () => ({ installHeaderTypeChange: vi.fn() }));

const install = vi.mocked(installTypeInfoPatch);
const installHeader = vi.mocked(installHeaderTypeChange);

const stub = (type: string) => ({ type, validate: () => true, render: () => undefined });

function plugin(widgetsEnabled: boolean, registered: Record<string, unknown> = {}, types: Record<string, string> = {}) {
	const mtm = { registeredTypeWidgets: { text: stub("text"), ...registered } as Record<string, unknown>, getTypeInfo: vi.fn(), trigger: vi.fn(), types };
	const app = { metadataTypeManager: mtm } as unknown as App;
	const p = new ImprovedBasesPlugin(app, { name: "Improved Bases" } as PluginManifest);
	Object.assign(p, { app, manifest: { name: "Improved Bases" } });
	p.settings = { widgetsEnabled };
	(p as unknown as { env: unknown }).env = {};
	p.registry = { schemas: () => [] } as never;
	return { p, mtm };
}

beforeEach(() => {
	install.mockReset();
	installHeader.mockReset();
	vi.mocked(Notice).mockClear();
});

describe("applyWidgetsEnabled", () => {
	it("installs the patch once and removes it when disabled", () => {
		const uninstall = vi.fn();
		install.mockReturnValue({ uninstall } as unknown as TypeInfoPatch);
		const { p } = plugin(true);
		p.applyWidgetsEnabled();
		p.applyWidgetsEnabled();
		expect(install).toHaveBeenCalledTimes(1);
		p.settings.widgetsEnabled = false;
		p.applyWidgetsEnabled();
		expect(uninstall).toHaveBeenCalledTimes(1);
		expect(p.typeInfoPatch).toBeNull();
		p.applyWidgetsEnabled();
		expect(uninstall).toHaveBeenCalledTimes(1);
	});
	it("marks widgets unsupported when the patch cannot be installed", () => {
		install.mockReturnValue(null);
		const { p } = plugin(true);
		p.applyWidgetsEnabled();
		expect(p.widgetsSupported).toBe(false);
		p.applyWidgetsEnabled();
		expect(install).toHaveBeenCalledTimes(1);
	});
	it("registers select/relation while on, removes them when off and refreshes affected fields", () => {
		const order: string[] = [];
		const uninstallPatch = vi.fn(() => order.push("patch"));
		const uninstallHeader = vi.fn(() => order.push("header"));
		install.mockReturnValue({ uninstall: uninstallPatch } as unknown as TypeInfoPatch);
		installHeader.mockReturnValue({ pending: () => null, uninstall: uninstallHeader });
		const { p, mtm } = plugin(true, {}, { lead: "select", team: "relation", name: "text" });
		p.applyWidgetsEnabled();
		expect(mtm.registeredTypeWidgets.select).toBeDefined();
		expect(mtm.registeredTypeWidgets.relation).toBeDefined();
		expect(installHeader).toHaveBeenCalledTimes(1);
		expect(install.mock.calls[0]![3]).toHaveProperty("pending");
		p.settings.widgetsEnabled = false;
		p.applyWidgetsEnabled();
		expect(order).toEqual(["header", "patch"]);
		expect(mtm.registeredTypeWidgets.select).toBeUndefined();
		expect(mtm.registeredTypeWidgets.relation).toBeUndefined();
		const changed = mtm.trigger.mock.calls.filter((c) => c[0] === "changed").map((c): unknown => c[1]);
		expect(changed.sort()).toEqual(["lead", "team"]);
	});
	it("skips ids registered by another plugin with one notice", () => {
		install.mockReturnValue({ uninstall: vi.fn() } as unknown as TypeInfoPatch);
		installHeader.mockReturnValue({ pending: () => null, uninstall: vi.fn() });
		const foreign = stub("select");
		const { p, mtm } = plugin(true, { select: foreign });
		p.applyWidgetsEnabled();
		expect(mtm.registeredTypeWidgets.select).toBe(foreign);
		expect(Notice).toHaveBeenCalledTimes(1);
		expect(Notice).toHaveBeenCalledWith('Improved Bases: property type "select" is already registered by another plugin');
		expect([...installHeader.mock.calls[0]![2].pluginTypes()]).toEqual(["relation"]);
		p.settings.widgetsEnabled = false;
		p.applyWidgetsEnabled();
		expect(mtm.registeredTypeWidgets.select).toBe(foreign);
	});
});
