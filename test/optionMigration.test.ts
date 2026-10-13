import { describe, it, expect, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { migrateOptionValues, optionValueEdit, renameInList } from "../src/schema/optionMigration";

function fakeApp(fms: Record<string, Record<string, unknown>>, opts: { fail?: string; cache?: Record<string, Record<string, unknown>> } = {}) {
  const processFrontMatter = vi.fn((f: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
    if (f.path === opts.fail) return Promise.reject(new Error("boom"));
    fn(fms[f.path] as Record<string, unknown>);
    return Promise.resolve();
  });
  const app = {
    fileManager: { processFrontMatter },
    metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: (opts.cache ?? fms)[f.path] }) },
  } as unknown as App;
  return { app, processFrontMatter, files: Object.keys(fms).map((path) => ({ path }) as TFile) };
}

describe("migrateOptionValues", () => {
  it("edits the key case-insensitively and counts changed and failed notes", async () => {
    const fms: Record<string, Record<string, unknown>> = {
      "a.md": { Status: "A" },
      "b.md": { status: ["A", "C"] },
      "c.md": { Status: "X" },
      "d.md": { Status: "A" },
      "e.md": { Other: "A" },
    };
    const { app, files } = fakeApp(fms, { fail: "d.md" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await migrateOptionValues(app, files, "Status", optionValueEdit([{ from: "A", to: "B" }], []));
    expect(res).toEqual({ changed: 2, failed: 1 });
    expect(fms["a.md"]).toEqual({ Status: "B" });
    expect(fms["b.md"]).toEqual({ status: ["B", "C"] });
    expect(fms["c.md"]).toEqual({ Status: "X" });
    expect(fms["e.md"]).toEqual({ Other: "A" });
  });
  it("does not write notes the cache shows nothing to change in", async () => {
    const { app, files, processFrontMatter } = fakeApp({ "a.md": { Status: "A" }, "b.md": { Status: "X" }, "c.md": { Other: "A" } });
    await migrateOptionValues(app, files, "Status", optionValueEdit([{ from: "A", to: "B" }], []));
    expect(processFrontMatter.mock.calls.map((c) => (c[0] as TFile).path)).toEqual(["a.md"]);
  });
  it("recomputes on the live frontmatter and counts only actual changes", async () => {
    // The cache says A, the note on disk already says X.
    const { app, files } = fakeApp({ "a.md": { Status: "X" } }, { cache: { "a.md": { Status: "A" } } });
    expect(await migrateOptionValues(app, files, "Status", optionValueEdit([{ from: "A", to: "B" }], []))).toEqual({ changed: 0, failed: 0 });
  });
  it("counts a throwing note only as failed", async () => {
    const { app, files } = fakeApp({ "a.md": { Status: "A" } }, { fail: "a.md" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await migrateOptionValues(app, files, "Status", optionValueEdit([{ from: "A", to: "B" }], []))).toEqual({ changed: 0, failed: 1 });
  });
  it("finds the value in a stale cache under the key's previous name", async () => {
    const { app, files } = fakeApp({ "a.md": { Stand: "A" } }, { cache: { "a.md": { Status: "A" } } });
    expect(await migrateOptionValues(app, files, "Stand", optionValueEdit([{ from: "A", to: "B" }], []), "Status")).toEqual({ changed: 1, failed: 0 });
  });
});

describe("optionValueEdit", () => {
  const edit = (renames: [string, string][], removals: string[] = []) => optionValueEdit(renames.map(([from, to]) => ({ from, to })), removals);
  it("swaps values without collapsing them", () => {
    const swap = edit([["Open", "Done"], ["Done", "Open"]]);
    expect(swap("Open")).toBe("Done");
    expect(swap("Done")).toBe("Open");
    expect(swap(["Open", "Done"])).toEqual(["Done", "Open"]);
  });
  it("maps each value at most once in a chain", () => {
    const chain = edit([["Todo", "Open"], ["Open", "Backlog"]]);
    expect(chain("Todo")).toBe("Open");
    expect(chain("Open")).toBe("Backlog");
  });
  it("removes a value and renames another onto its name", () => {
    const e = edit([["Finished", "Done"]], ["Done"]);
    expect(e("Done")).toBeNull();
    expect(e("Finished")).toBe("Done");
    expect(e(["Done", "Finished"])).toEqual(["Done"]);
  });
  it("ignores non-strings and keeps other list elements", () => {
    expect(edit([["A", "B"]])(3)).toBeUndefined();
    expect(edit([], ["A"])(["A", 3, null])).toEqual([3, null]);
  });
  it("renames in a plain list the same way", () => {
    expect(renameInList(["X", "X", "A", "B"], "A", "B")).toEqual(["X", "B"]);
    expect(renameInList(["X"], "A", "B")).toEqual(["X"]);
  });
  it("leaves a list without duplicates once it touches it", () => {
    expect(edit([["A", "B"]])(["X", "X", "A", "B"])).toEqual(["X", "B"]);
    expect(edit([], ["A"])(["X", "A", "X"])).toEqual(["X"]);
  });
  it("leaves untouched values alone", () => {
    const e = edit([["A", "B"]], ["C"]);
    expect(e("X")).toBeUndefined();
    expect(e(["X", "Y"])).toBeUndefined();
    expect(e(3)).toBeUndefined();
    expect(e(null)).toBeUndefined();
  });
  it("maps lists element-wise, drops removed elements and dedupes", () => {
    expect(edit([["A", "B"]], ["C"])(["A", "X", "C", "B"])).toEqual(["B", "X"]);
  });
});
