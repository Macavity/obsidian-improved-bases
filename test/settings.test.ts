import { describe, it, expect, vi } from "vitest";
import { Setting, type App } from "obsidian";
import { mergeSettings, DEFAULT_SETTINGS, ImprovedBasesSettingTab } from "../src/settings";
import { WarningRegistry } from "../src/warnings/WarningRegistry";

function plugin() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    warnings: new WarningRegistry(),
    saveSettings: vi.fn(() => Promise.resolve()),
    applySettings: vi.fn(),
    showWarnings: vi.fn(),
  };
}

describe("settings", () => {
  it("merges defensively", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ showToolbarButton: "no", showConflictMarkers: 1, defaultEntryIcon: 3, junk: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ showToolbarButton: false, showConflictMarkers: false, defaultEntryIcon: " 📁 " })).toEqual({ showToolbarButton: false, showConflictMarkers: false, defaultEntryIcon: "📁" });
  });
  it("ignores the removed widgetsEnabled and importFolder keys and a blank icon", () => {
    expect(mergeSettings({ importFolder: "Optionen", widgetsEnabled: false, defaultEntryIcon: "  " })).toEqual(DEFAULT_SETTINGS);
  });
  it("setControlValue merges, saves and applies", async () => {
    const p = plugin();
    const tab = new ImprovedBasesSettingTab({} as App, p as never);
    await tab.setControlValue("junk", 1);
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    await tab.setControlValue("showToolbarButton", false);
    expect(p.settings.showToolbarButton).toBe(false);
    expect(p.saveSettings).toHaveBeenCalledTimes(2);
    expect(p.applySettings).toHaveBeenCalledTimes(2);
  });
  it("offers the icon, the two toggles and the warnings row", () => {
    const tab = new ImprovedBasesSettingTab({} as App, plugin() as never);
    const defs = tab.getSettingDefinitions() as { control?: { key: string }; render?: unknown }[];
    expect(defs.map((d) => d.control?.key ?? "render")).toEqual(["defaultEntryIcon", "showToolbarButton", "showConflictMarkers", "render"]);
  });
  it("renders the warning count live and opens the list", () => {
    const p = plugin();
    const tab = new ImprovedBasesSettingTab({} as App, p as never);
    const setting = new Setting(document.body.createDiv());
    const off = tab.renderWarnings(setting);
    expect(setting.nameEl.textContent).toBe("0 current warnings");
    p.warnings.report("x", { text: "boom" });
    expect(setting.nameEl.textContent).toBe("1 current warning");
    setting.controlEl.querySelector("button")!.click();
    expect(p.showWarnings).toHaveBeenCalledTimes(1);
    off();
    p.warnings.resolve("x");
    expect(setting.nameEl.textContent).toBe("1 current warning");
  });
});
