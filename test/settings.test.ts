import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { mergeSettings, DEFAULT_SETTINGS, ImprovedBasesSettingTab } from "../src/settings";

describe("settings", () => {
  it("merges defensively", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ widgetsEnabled: "no", importFolder: 3, junk: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ widgetsEnabled: false, importFolder: "Opt" })).toEqual({ widgetsEnabled: false, importFolder: "Opt" });
  });
  it("setControlValue merges instead of storing unchecked values", async () => {
    const plugin = {
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn(() => Promise.resolve()),
      applyWidgetsEnabled: vi.fn(),
    };
    const tab = new ImprovedBasesSettingTab({} as App, plugin as never);
    await tab.setControlValue("importFolder", 5);
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    await tab.setControlValue("junk", 1);
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    await tab.setControlValue("widgetsEnabled", false);
    expect(plugin.settings.widgetsEnabled).toBe(false);
    expect(plugin.applyWidgetsEnabled).toHaveBeenCalledTimes(1);
  });
});
