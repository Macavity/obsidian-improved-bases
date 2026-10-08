import { describe, it, expect } from "vitest";
import manifest from "../manifest.json";
import { TFile, Events } from "obsidian";

describe("tooling", () => {
  it("manifest follows community rules", () => {
    expect(manifest.id).toBe("improved-bases");
    expect(manifest.id).not.toMatch(/obsidian/i);
    expect(manifest.name).not.toMatch(/obsidian/i);
    expect(manifest.isDesktopOnly).toBe(false);
  });
  it("obsidian mock resolves and Events works", () => {
    expect(new TFile()).toBeInstanceOf(TFile);
    const e = new Events(); let hit = 0;
    e.on("x", () => hit++); e.trigger("x");
    expect(hit).toBe(1);
  });
});
