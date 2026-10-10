import { describe, it, expect, vi } from "vitest";
import type { App, Plugin, TFile } from "obsidian";
import { buildSchemaSettings, migrateRenames, renameSummary, schemaState } from "../src/commands/schemaSettings";
import type { SchemaRegistry } from "../src/schema/SchemaRegistry";
import type { WidgetEnv } from "../src/widgets/types";

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

describe("buildSchemaSettings", () => {
  const file = (path: string, frontmatter?: Record<string, unknown>) => ({ path, extension: path.split(".").pop(), frontmatter }) as unknown as TFile;
  function setup(opts: { schema?: boolean; error?: boolean; members?: TFile[] | null; ready?: boolean } = {}) {
    const members = opts.members === undefined ? [file("a.md", { Role: 1, position: {} }), file("b.md", { Team: 2 })] : opts.members;
    const fields = new Map([["role", { name: "Role", field: { type: "text" as const } }]]);
    const reg = registry(opts.schema ? [{ basePath: "M.base", fields }] : [], opts.error ? { "M.base": ["bad"] } : {});
    const processFrontMatter = vi.fn((f: TFile, fn: (fm: Record<string, unknown>) => void) => {
      fn((f as unknown as { frontmatter: Record<string, unknown> }).frontmatter);
      return Promise.resolve();
    });
    const app = {
      metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: (f as unknown as { frontmatter?: Record<string, unknown> }).frontmatter }) },
      vault: { getFiles: () => [file("Z.base"), file("M.base"), file("n.md"), file("A.base")] },
      fileManager: { processFrontMatter },
    } as unknown as App;
    const writer = { activate: vi.fn(() => Promise.resolve()), update: vi.fn(() => Promise.resolve()), reset: vi.fn(() => Promise.resolve()) };
    const membership = { ready: opts.ready ?? true, targetEntries: () => members };
    const env = { app, writer, membership, overlays: {} } as unknown as WidgetEnv;
    return { ...buildSchemaSettings({ app } as unknown as Plugin, env, reg, "M.base"), processFrontMatter, writer, membership };
  }

  it("collects property names and other bases", () => {
    const { input } = setup({ schema: true });
    expect(input.propertyNames).toEqual(["Role", "Team"]);
    expect(input.basePaths).toEqual(["A.base", "Z.base"]);
    expect(input.state).toMatchObject({ kind: "fields", drafts: [{ originalName: "Role", name: "Role" }] });
  });
  it("reads membership readiness live", () => {
    const { input, membership } = setup({ ready: false });
    expect(input.canRename()).toBe(false);
    membership.ready = true;
    expect(input.canRename()).toBe(true);
  });
  it("activates a base without schema before the first save", async () => {
    const { handlers, writer } = setup();
    await handlers.onSave([]);
    expect(writer.activate).toHaveBeenCalledWith("M.base");
    expect(writer.update).toHaveBeenCalledTimes(1);
    const { handlers: h2, writer: w2 } = setup({ error: true });
    await h2.onSave([]);
    expect(w2.activate).not.toHaveBeenCalled();
    await setup({ schema: true }).handlers.onSave([]);
  });
  it("migrates renamed properties after the schema write", async () => {
    const { handlers, processFrontMatter } = setup({ schema: true });
    await handlers.onSave([{ originalName: "Role", name: "Rolle", type: "text", multiple: false, options: [] }]);
    expect(processFrontMatter).toHaveBeenCalledTimes(1);
    const second = setup({ schema: true, members: null });
    await second.handlers.onSave([{ originalName: "Role", name: "Rolle", type: "text", multiple: false, options: [] }]);
    expect(second.processFrontMatter).not.toHaveBeenCalled();
  });
  it("resets through the writer", async () => {
    const { handlers, writer } = setup({ error: true });
    await handlers.onReset();
    expect(writer.reset).toHaveBeenCalledWith("M.base");
  });
});
