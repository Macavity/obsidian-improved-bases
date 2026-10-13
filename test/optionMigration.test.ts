import { describe, it, expect, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { migrateOptionValues } from "../src/schema/optionMigration";
import { renameValue } from "../src/widgets/values";

describe("migrateOptionValues", () => {
  it("edits the key case-insensitively and counts changed and failed notes", async () => {
    const fms: Record<string, Record<string, unknown>> = {
      "a.md": { Status: "A" },
      "b.md": { status: ["A", "C"] },
      "c.md": { Status: "X" },
      "d.md": { Status: "A" },
      "e.md": { Other: "A" },
    };
    const app = {
      fileManager: {
        processFrontMatter: (f: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
          if (f.path === "d.md") return Promise.reject(new Error("boom"));
          fn(fms[f.path] as Record<string, unknown>);
          return Promise.resolve();
        },
      },
    } as unknown as App;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const files = Object.keys(fms).map((path) => ({ path }) as TFile);
    const res = await migrateOptionValues(app, files, "Status", (v) => renameValue(v, "A", "B"));
    expect(res).toEqual({ changed: 2, failed: 1 });
    expect(fms["a.md"]).toEqual({ Status: "B" });
    expect(fms["b.md"]).toEqual({ status: ["B", "C"] });
    expect(fms["c.md"]).toEqual({ Status: "X" });
    expect(fms["e.md"]).toEqual({ Other: "A" });
  });
});
