import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App, PluginManifest } from "obsidian";
import { installTypeInfoPatch, type TypeInfoPatch } from "../src/internals/typeInfoPatch";
import ImprovedBasesPlugin from "../src/main";

vi.mock("../src/internals/typeInfoPatch", () => ({ installTypeInfoPatch: vi.fn() }));

const install = vi.mocked(installTypeInfoPatch);

function plugin(widgetsEnabled: boolean) {
	const p = new ImprovedBasesPlugin({} as App, { name: "Improved Bases" } as PluginManifest);
	p.settings = { widgetsEnabled };
	return p;
}

beforeEach(() => {
	install.mockReset();
});

describe("applyWidgetsEnabled", () => {
	it("installs the patch once and removes it when disabled", () => {
		const uninstall = vi.fn();
		install.mockReturnValue({ uninstall } as unknown as TypeInfoPatch);
		const p = plugin(true);
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
		const p = plugin(true);
		p.applyWidgetsEnabled();
		expect(p.widgetsSupported).toBe(false);
		p.applyWidgetsEnabled();
		expect(install).toHaveBeenCalledTimes(1);
	});
});
