import { describe, it, expect } from "vitest";
import type { App, TFile } from "obsidian";
import { migrateRenames, renameSummary, schemaState } from "../src/commands/schemaSettings";
import type { SchemaRegistry } from "../src/schema/SchemaRegistry";

const registry = (schemas: { basePath: string; fields: Map<string, { name: string; field: { type: "text" } }> }[], errors: Record<string, string[]>) =>
  ({ schemas: () => schemas, errors: () => new Map(Object.entries(errors)) }) as unknown as SchemaRegistry;

describe("schemaState", () => {
  it("maps schema fields to drafts", () => {
    const fields = new Map([["role", { name: "Role", field: { type: "text" as const } }]]);
    const state = schemaState(registry([{ basePath: "A.base", fields }], {}), "A.base");
    expect(state.kind).toBe("fields");
    if (state.kind === "fields") expect(state.drafts).toMatchObject([{ originalName: "Role", name: "Role", type: "text" }]);
  });
  it("reports schema errors", () => {
    expect(schemaState(registry([], { "A.base": ["bad", "worse"] }), "A.base")).toEqual({ kind: "error", message: "bad; worse" });
  });
  it("starts empty for unknown bases", () => {
    expect(schemaState(registry([], {}), "A.base")).toEqual({ kind: "fields", drafts: [] });
  });
});

describe("migrateRenames", () => {
  it("migrates sequentially, skips notes without the key and counts outcomes per note", async () => {
    const calls: string[] = [];
    const resolvers: (() => void)[] = [];
    const fms: Record<string, Record<string, unknown>> = { "a.md": { role: 1 }, "b.md": { Role: 1, Rolle: 2 }, "c.md": {}, "d.md": { Role: 1 } };
    const app = {
      metadataCache: { getFileCache: (f: { path: string }) => ({ frontmatter: fms[f.path] }) },
      fileManager: {
        processFrontMatter: (f: { path: string }, fn: (fm: Record<string, unknown>) => void) =>
          new Promise<void>((resolve, reject) => {
            calls.push(f.path);
            fn(fms[f.path] as Record<string, unknown>);
            if (f.path === "d.md") return reject(new Error("boom")); // write fails after the callback ran
            resolvers.push(resolve);
          }),
      },
    } as unknown as App;
    const files = ["a.md", "b.md", "c.md", "d.md"].map((path) => ({ path }) as TFile);
    const done = migrateRenames(app, files, [{ from: "Role", to: "Rolle" }]);
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    await tick();
    expect(calls).toEqual(["a.md"]);
    await tick();
    expect(calls).toEqual(["a.md"]); // still waiting for the first to resolve
    resolvers[0]?.();
    await tick();
    expect(calls).toEqual(["a.md", "b.md"]);
    resolvers[1]?.();
    expect(await done).toEqual({ renamed: 1, conflict: 1, failed: 1 });
    expect(calls).toEqual(["a.md", "b.md", "d.md"]); // c.md has no such key
    expect(fms["a.md"]).toEqual({ Rolle: 1 });
    expect(fms["b.md"]).toEqual({ Role: 1, Rolle: 2 });
  });
});

describe("renameSummary", () => {
  const pairs = [{ from: "Role", to: "Rolle" }];
  it("omits zero skipped and failed", () => {
    expect(renameSummary(pairs, { renamed: 8, conflict: 0, failed: 0 })).toBe("Renamed Role → Rolle in 8 notes");
  });
  it("lists skipped and failed", () => {
    expect(renameSummary(pairs, { renamed: 1, conflict: 1, failed: 2 })).toBe("Renamed Role → Rolle in 1 note, 1 skipped (both keys present), 2 failed");
  });
  it("reports unknown members", () => {
    expect(renameSummary(pairs, null)).toBe("Properties not renamed: base members unknown");
  });
});
