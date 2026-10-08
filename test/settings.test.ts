import { describe, it, expect } from "vitest";
import { mergeSettings, DEFAULT_SETTINGS } from "../src/settings";

describe("settings", () => {
  it("merges defensively", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ widgetsEnabled: "no", importFolder: 3, junk: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ widgetsEnabled: false, importFolder: "Opt" })).toEqual({ widgetsEnabled: false, importFolder: "Opt" });
  });
});
