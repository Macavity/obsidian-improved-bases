import { describe, it, expect, vi } from "vitest";
import { TFile, type App, type Plugin } from "obsidian";
import { buildSchemaSettings, countNotesWithKey, migrateRenames, removeProperties, renameSummary, saveSummary, schemaState } from "../src/schema-settings/schemaSettings";
import type { FieldDraft } from "../src/schema-settings/schemaDraft";
import type { SchemaRegistry } from "../src/schema/SchemaRegistry";
import type { WidgetEnv } from "../src/widgets/types";

const notices = vi.hoisted(() => [] as string[]);
vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  Notice: class { constructor(message: string) { notices.push(message); } },
}));

const mdFile = (path: string, frontmatter: Record<string, unknown>) => Object.assign(new TFile(), { path, extension: "md", frontmatter });
const fmText = (f: TFile) => {
  const fm = (f as unknown as { frontmatter?: Record<string, unknown> }).frontmatter;
  return fm ? `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n` : "";
};
const d = (o: Partial<FieldDraft>): FieldDraft => ({ originalName: null, originalBase: null, name: "", type: "native", detected: null, override: null, removed: false, multiple: false, options: [], ...o });

const registry = (schemas: { basePath: string; fields: Map<string, { name: string; field: { type: "text" } }> }[], errors: Record<string, string[]>) =>
  ({ schemas: () => schemas, errors: () => new Map(Object.entries(errors)) }) as unknown as SchemaRegistry;

describe("migrateRenames", () => {
  it("migrates sequentially, skips notes without the key on disk and counts outcomes per note", async () => {
    const calls: string[] = [];
    const resolvers: (() => void)[] = [];
    const fms: Record<string, Record<string, unknown>> = { "a.md": { Role: 1 }, "b.md": { Role: 1, Rolle: 2 }, "c.md": { role: 1 }, "d.md": { Role: 1 }, "e.md": {} };
    const texts: Record<string, string> = {
      "a.md": "---\nRole: 1\n---\n",
      "b.md": "---\nRole: 1\nRolle: 2\n---\n",
      "c.md": "---\nrole: 1\n---\nbody",
      "d.md": "---\nRole: [\n---\n", // broken YAML: left to processFrontMatter
      "e.md": "no frontmatter",
    };
    const app = {
      vault: { cachedRead: (f: { path: string }) => Promise.resolve(texts[f.path]) },
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
    const files = ["a.md", "b.md", "c.md", "d.md", "e.md"].map((path) => ({ path }) as TFile);
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
    expect(calls).toEqual(["a.md", "b.md", "d.md"]); // c.md only has `role`, e.md has no frontmatter
    expect(fms["a.md"]).toEqual({ Rolle: 1 });
    expect(fms["b.md"]).toEqual({ Role: 1, Rolle: 2 });
    expect(fms["c.md"]).toEqual({ role: 1 });
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

describe("schemaState", () => {
  const columns = { views: ["A"], orderByView: [["Team"]], configured: [], expressions: [] };
  it("builds drafts or reports registry errors", () => {
    const state = schemaState(registry([], {}), "A.base", columns, ["Status"], () => "text", 0);
    expect(state.kind === "fields" && state.drafts.map((x) => [x.name, x.detected])).toEqual([["Team", "text"], ["Status", "text"]]);
    expect(schemaState(registry([], { "A.base": ["bad", "worse"] }), "A.base", columns, [], () => null, 0)).toEqual({ kind: "error", message: "bad; worse", resettable: true });
  });
});

describe("saveSummary", () => {
  it("formats lines", () => {
    expect(saveSummary({ renames: "Renamed A → B in 1 note", removed: [{ name: "X", removed: 2, failed: 0 }, { name: "Y", removed: 1, failed: 3 }], referenced: ["A"] })).toBe(
      "Renamed A → B in 1 note\nRemoved 'X' from 2 notes\nRemoved 'Y' from 1 note, 3 failed\nFilters or formulas still reference 'A', update them manually",
    );
    expect(saveSummary({ renames: "", removed: [], referenced: [] })).toBe("");
  });
});

describe("countNotesWithKey / removeProperties", () => {
  const mk = () => [mdFile("a.md", { Old: 1, Keep: 2 }), mdFile("b.md", { Other: 1 }), mdFile("c.md", { Old: 3 })];
  const fmOf = (f: TFile) => (f as unknown as { frontmatter: Record<string, unknown> }).frontmatter;
  const app = (fail?: string, unreadable?: string) => {
    const processFrontMatter = vi.fn((f: TFile, fn: (fm: Record<string, unknown>) => void) => {
      if (f.path === fail) return Promise.reject(new Error("boom"));
      fn(fmOf(f));
      return Promise.resolve();
    });
    const cachedRead = (f: TFile) => (f.path === unreadable ? Promise.reject(new Error("io")) : Promise.resolve(fmText(f)));
    return { app: { vault: { cachedRead }, fileManager: { processFrontMatter } } as unknown as App, processFrontMatter };
  };
  it("counts members whose frontmatter has the key", async () => {
    expect(await countNotesWithKey(app().app, mk(), "Old")).toBe(2);
    expect(await countNotesWithKey(app().app, mk(), "Nope")).toBe(0);
  });
  it("counts keys case-insensitively", async () => {
    expect(await countNotesWithKey(app().app, [mdFile("a.md", { status: "x" })], "Status")).toBe(1);
  });
  it("deletes keys and counts failures", async () => {
    const files = mk();
    const t = app("c.md");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await removeProperties(t.app, files, ["Old"])).toEqual([{ name: "Old", removed: 1, failed: 1 }]);
    expect(t.processFrontMatter).toHaveBeenCalledTimes(2); // b.md skipped
    expect(fmOf(files[0] as TFile)).toEqual({ Keep: 2 });
  });
  it("deletes every case variant of the key", async () => {
    const files = [mdFile("a.md", { status: "x" }), mdFile("b.md", { Status: 1, status: 2, Keep: 3 })];
    const t = app();
    expect(await removeProperties(t.app, files, ["Status"])).toEqual([{ name: "Status", removed: 2, failed: 0 }]);
    expect(fmOf(files[0] as TFile)).toEqual({});
    expect(fmOf(files[1] as TFile)).toEqual({ Keep: 3 });
  });
  it("removes several names in one pass per note", async () => {
    const files = [mdFile("a.md", { Old: 1, Other: 2 }), mdFile("b.md", { Old: 3 }), mdFile("c.md", { Keep: 4 })];
    const t = app();
    expect(await removeProperties(t.app, files, ["Old", "Other"])).toEqual([{ name: "Old", removed: 2, failed: 0 }, { name: "Other", removed: 1, failed: 0 }]);
    expect(t.processFrontMatter).toHaveBeenCalledTimes(2);
    expect(fmOf(files[0] as TFile)).toEqual({});
    expect(fmOf(files[1] as TFile)).toEqual({});
  });
  it("counts a failed write for the names the note had", async () => {
    const files = [mdFile("a.md", { Old: 1 }), mdFile("b.md", { Old: 2, Other: 3 })];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await removeProperties(app("a.md").app, files, ["Old", "Other"])).toEqual([{ name: "Old", removed: 1, failed: 1 }, { name: "Other", removed: 1, failed: 0 }]);
  });
  it("counts an unreadable note as failed for every name and continues", async () => {
    const files = [mdFile("a.md", { Old: 1 }), mdFile("b.md", { Old: 2 })];
    const t = app(undefined, "a.md");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await removeProperties(t.app, files, ["Old", "Other"])).toEqual([{ name: "Old", removed: 1, failed: 1 }, { name: "Other", removed: 0, failed: 1 }]);
    expect(t.processFrontMatter).toHaveBeenCalledTimes(1);
  });
  it("counts an unreadable note as failed when renaming and continues", async () => {
    const files = [mdFile("a.md", { Old: 1 }), mdFile("b.md", { Old: 2 })];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await migrateRenames(app(undefined, "a.md").app, files, [{ from: "Old", to: "New" }])).toEqual({ renamed: 1, conflict: 0, failed: 1 });
    expect(fmOf(files[1] as TFile)).toEqual({ New: 2 });
  });
});

describe("buildSchemaSettings", () => {
  const baseFile = (path: string) => Object.assign(new TFile(), { path, extension: path.split(".").pop() });
  function setup(opts: { base?: string; viewName?: string | null; memberKeys?: string[]; error?: boolean; members?: TFile[] | null; icon?: string } = {}) {
    const members = opts.members === undefined ? [mdFile("a.md", { Status: "x", Old: "y" }), mdFile("b.md", { Other: "z" })] : opts.members;
    const all = opts.memberKeys ? [...(members ?? []), mdFile("k.md", Object.fromEntries(opts.memberKeys.map((k) => [k, 1])))] : members;
    const reg = registry([], opts.error ? { "M.base": ["bad"] } : {});
    const baseText = opts.base ?? "views:\n  - type: table\n    name: A\n";
    const processFrontMatter = vi.fn((f: TFile, fn: (fm: Record<string, unknown>) => void) => {
      fn((f as unknown as { frontmatter: Record<string, unknown> }).frontmatter);
      return Promise.resolve();
    });
    const app = {
      metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: (f as unknown as { frontmatter?: Record<string, unknown> }).frontmatter }) },
      vault: {
        getFiles: () => [baseFile("Z.base"), baseFile("M.base"), baseFile("n.md"), baseFile("A.base")],
        getAbstractFileByPath: (p: string) => (p === "M.base" ? baseFile("M.base") : null),
        cachedRead: (f: TFile) => Promise.resolve(f.path === "M.base" ? baseText : fmText(f)),
      },
      fileManager: { processFrontMatter },
    } as unknown as App;
    const writer = { update: vi.fn(() => Promise.resolve()), reset: vi.fn(() => Promise.resolve()) };
    const membership = { targetEntries: () => all, baseIcon: (p: string) => (p === "M.base" ? opts.icon ?? null : p === "Z.base" ? "🏢" : null) };
    const env = { app, writer, membership, overlays: {} } as unknown as WidgetEnv;
    return { app, env, reg, writer, membership, processFrontMatter, viewName: opts.viewName ?? null };
  }
  async function build(opts: Parameters<typeof setup>[0] = {}) {
    const t = setup(opts);
    return { ...t, ...(await buildSchemaSettings({ app: t.app } as unknown as Plugin, t.env, t.reg, "M.base", t.viewName)) };
  }
  const lastNotice = () => notices.at(-1) ?? "";

  it("prefills known fields ordered by the current view", async () => {
    const { input } = await build({ base: "views:\n  - type: table\n    name: A\n    order: [file.name, Team]\n  - type: cards\n    name: B\n    order: [Status]\n", viewName: "B", memberKeys: ["created"], members: [] });
    expect(input.state.kind === "fields" && input.state.drafts.map((d) => d.name)).toEqual(["Status", "created", "Team"]);
    expect(input.views).toEqual(["A", "B"]);
    expect(input.defaultViewIndex).toBe(1);
  });
  it("lists the other bases' definitions of a field with the member overlap", async () => {
    const t = setup();
    const other = { basePath: "Z.base", fields: new Map([["team", { name: "Team", field: { type: "text" as const } }]]) };
    const reg = { schemas: () => [other], errors: () => new Map() } as unknown as SchemaRegistry;
    const shared = mdFile("a.md", { Status: "x" });
    const byBase: Record<string, TFile[]> = { "M.base": [shared, mdFile("b.md", {})], "Z.base": [shared, mdFile("z.md", {})] };
    (t.membership as { targetEntries: (p: string) => TFile[] | null }).targetEntries = (p) => byBase[p] ?? null;
    const { input } = await buildSchemaSettings({ app: t.app } as unknown as Plugin, t.env, reg, "M.base", null);
    expect(input.otherDefinitions("TEAM")).toEqual([{ basePath: "Z.base", field: { type: "text" }, shared: 1 }]);
    expect(input.otherDefinitions("Other")).toEqual([]);
    // This base's own definition is not "other"; unknown members count as 0.
    const own = { basePath: "M.base", fields: new Map([["team", { name: "Team", field: { type: "text" as const } }]]) };
    const reg2 = { schemas: () => [own, other], errors: () => new Map() } as unknown as SchemaRegistry;
    t.membership.targetEntries = () => null;
    const r2 = await buildSchemaSettings({ app: t.app } as unknown as Plugin, t.env, reg2, "M.base", null);
    expect(r2.input.otherDefinitions("team")).toEqual([{ basePath: "Z.base", field: { type: "text" }, shared: 0 }]);
  });
  it("prefills the base icon and passes the saved one to the writer", async () => {
    const { input, handlers, writer } = await build({ icon: "🏢" });
    expect(input.icon).toBe("🏢");
    await handlers.onSave([], 0, "👥");
    expect(writer.update).toHaveBeenCalledWith("M.base", expect.any(Function), { add: [], remove: [], rename: [] }, "👥");
    const none = await build();
    expect(none.input.icon).toBe("");
    expect(input.baseIcon("Z.base")).toBe("🏢");
    expect(input.baseIcon("A.base")).toBeNull();
  });
  it("collects the other bases", async () => {
    const { input } = await build();
    expect(input.basePaths).toEqual(["A.base", "M.base", "Z.base"]);
  });
  it("throws for a missing base", async () => {
    const t = setup();
    await expect(buildSchemaSettings({ app: t.app } as unknown as Plugin, t.env, t.reg, "X.base", null)).rejects.toThrow("Base not found");
  });
  it("reports an unparsable base without reset", async () => {
    const { input } = await build({ base: "views: [\n" });
    expect(input.state).toMatchObject({ kind: "error", resettable: false });
  });
  it("reports registry errors as resettable", async () => {
    const { input } = await build({ error: true });
    expect(input.state).toEqual({ kind: "error", message: "bad", resettable: true });
  });
  it("knows the members only once this base has a query result", async () => {
    const { input, membership } = await build({ members: null });
    expect(input.membersKnown()).toBe(false);
    membership.targetEntries = () => [];
    expect(input.membersKnown()).toBe(true);
  });
  it("saves with a plain notice when nothing is renamed or removed", async () => {
    const { handlers, writer } = await build();
    await handlers.onSave([], 0, "");
    expect(writer.update).toHaveBeenCalledTimes(1);
    expect(lastNotice()).toBe("Schema saved");
  });
  it("saves base, migrates renames, removes properties and reports", async () => {
    const t = await build({ base: 'filters: \'Status == "x"\'\nviews:\n  - type: table\n    name: A\n' });
    await t.handlers.onSave([
      d({ originalName: "Status", name: "Stand", type: "select", options: [] }),
      d({ originalName: "Old", name: "Old", removed: true }),
    ], 0, "");
    expect(t.writer.update).toHaveBeenCalledTimes(1);
    expect(t.processFrontMatter).toHaveBeenCalledTimes(2); // rename pass + removal pass on the first note only
    expect(lastNotice()).toMatch(/Renamed Status → Stand in 1 note/);
    expect(lastNotice()).toMatch(/Removed 'Old' from 1 note/);
    expect(lastNotice()).toMatch(/Filters or formulas still reference 'Status'/);
  });
  it("writes the base edits and a mutation that renames the schema entry", async () => {
    const t = await build();
    await t.handlers.onSave([d({ originalName: "Status", name: "Stand", type: "select", options: [] }), d({ originalName: "Old", name: "Old", removed: true })], 0, "");
    expect(t.writer.update).toHaveBeenCalledWith("M.base", expect.any(Function), { add: [], remove: ["Old"], rename: [{ from: "Status", to: "Stand" }] }, "");
    const mutate = (t.writer.update.mock.calls[0] as unknown as [string, (f: Record<string, Record<string, unknown>>) => void])[1];
    const fields: Record<string, Record<string, unknown>> = { Status: { type: "text" }, Unrelated: { type: "relation", base: "X.base" } };
    mutate(fields);
    expect(Object.keys(fields).sort()).toEqual(["Stand", "Unrelated"]);
    expect(fields.Stand).toMatchObject({ type: "select" });
    expect(fields.Unrelated).toEqual({ type: "relation", base: "X.base" });
  });
  it("saves the base before renaming and renames before removing", async () => {
    const t = await build();
    const log: string[] = [];
    t.writer.update.mockImplementation(() => { log.push("base"); return Promise.resolve(); });
    t.processFrontMatter.mockImplementation((_f: TFile, fn: (fm: Record<string, unknown>) => void) => {
      const fm: Record<string, unknown> = { Status: "x", Old: "y" };
      fn(fm);
      log.push(Object.hasOwn(fm, "Stand") ? "rename" : "remove");
      return Promise.resolve();
    });
    await t.handlers.onSave([d({ originalName: "Status", name: "Stand" }), d({ originalName: "Old", name: "Old", removed: true })], 0, "");
    expect(log).toEqual(["base", "rename", "remove"]);
  });
  it("rejects without touching notes when the base write fails", async () => {
    const t = await build();
    t.writer.update.mockImplementation(() => Promise.reject(new Error("disk")));
    const before = notices.length;
    await expect(t.handlers.onSave([d({ originalName: "Status", name: "Stand" }), d({ originalName: "Old", name: "Old", removed: true })], 0, "")).rejects.toThrow("disk");
    expect(t.processFrontMatter).not.toHaveBeenCalled();
    expect(notices.length).toBe(before);
  });
  it("reports removals as not done when members are unknown", async () => {
    const t = await build({ members: null });
    await t.handlers.onSave([d({ originalName: "Old", name: "Old", removed: true })], 0, "");
    expect(t.processFrontMatter).not.toHaveBeenCalled();
    expect(lastNotice()).toContain("Properties not removed: base members unknown");
  });
  it("warns when filters or formulas reference a removed field", async () => {
    const t = await build({ base: 'filters: \'Old == "y"\'\nviews:\n  - type: table\n    name: A\n' });
    await t.handlers.onSave([d({ originalName: "Old", name: "Old", removed: true })], 0, "");
    expect(lastNotice()).toMatch(/Filters or formulas still reference 'Old'/);
  });
  it("does not touch notes when members are unknown", async () => {
    const t = await build({ members: null });
    await t.handlers.onSave([d({ originalName: "Old", name: "Old", removed: true }), d({ originalName: "A", name: "B" })], 0, "");
    expect(t.processFrontMatter).not.toHaveBeenCalled();
    expect(lastNotice()).toMatch(/Properties not renamed/);
    expect(lastNotice()).toMatch(/Properties not removed/);
    expect(await t.handlers.countAffected("Old")).toBe(0);
  });
  it("counts affected notes", async () => {
    const { handlers } = await build();
    expect(await handlers.countAffected("Old")).toBe(1);
  });
  it("resets through the writer", async () => {
    const { handlers, writer } = await build({ error: true });
    await handlers.onReset();
    expect(writer.reset).toHaveBeenCalledWith("M.base");
  });
});
