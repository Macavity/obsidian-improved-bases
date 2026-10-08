import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import type { TypeInfo, TypeWidget } from "../src/internals/detect";
import { installTypeInfoPatch, type PluginWidgets } from "../src/internals/typeInfoPatch";
import type { FieldSchema } from "../src/schema/types";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

interface FakeMtm {
  registeredTypeWidgets: Record<string, TypeWidget>;
  getTypeInfo(name: string, value: unknown): TypeInfo;
  trigger: ReturnType<typeof vi.fn>;
}
interface FakeMembership {
  knownFieldNames(): Set<string>;
  resolve(path: string, key: string): FieldSchema | null;
  on(name: string, cb: (...a: unknown[]) => void): unknown;
  offref?(ref: unknown): void;
}

const widget = (type: string) => ({ type, validate: () => true, render: vi.fn(() => ({ type, focus() {} })) });

function fakeApp() {
  const text = widget("text");
  const multitext = widget("multitext");
  const mtm: FakeMtm = {
    registeredTypeWidgets: { text, multitext },
    getTypeInfo: vi.fn(() => ({ expected: text, inferred: text })),
    trigger: vi.fn(),
  };
  return { app: { metadataTypeManager: mtm } as unknown as App, text, multitext, mtm };
}
const ctx = (sourcePath: string, key = "Team") =>
  ({ sourcePath, key, onChange: vi.fn(), blur: vi.fn() }) as unknown as PropertyRenderContext;
const env = (membership: FakeMembership) => ({ membership, overlays: new OverlayRegistry() }) as unknown as WidgetEnv;
const widgets = (w: Partial<Record<"relation" | "select", unknown>>) =>
  ({ relation: vi.fn(), select: vi.fn(), ...w }) as unknown as PluginWidgets;
const div = () => document.createElement("div");

describe("typeInfoPatch", () => {
  it("dispatches per file and leaves unknown names alone", () => {
    const { app, text, multitext, mtm } = fakeApp();
    const membership: FakeMembership = {
      knownFieldNames: () => new Set(["team"]),
      resolve: (p) => p === "a.md" ? { type: "relation", base: "T.base", multiple: false }
        : p === "m.md" ? { type: "list" } : null,
      on: vi.fn(),
    };
    const relation = vi.fn(() => ({ type: "relation", focus() {} }));
    const patch = installTypeInfoPatch(app, env(membership), widgets({ relation }))!;
    const info = mtm.getTypeInfo("Team", "[[X]]");
    expect(info.expected).toBe(info.inferred);
    info.inferred.render(div(), "[[X]]", ctx("a.md"));
    info.inferred.render(div(), ["x"], ctx("m.md"));
    info.inferred.render(div(), "y", ctx("other.md"));
    expect(relation).toHaveBeenCalledTimes(1);
    expect(multitext.render).toHaveBeenCalledTimes(1);
    expect(text.render).toHaveBeenCalledTimes(1);
    expect(mtm.getTypeInfo("Other", "v").inferred).toBe(text);
    expect(mtm.getTypeInfo("Team", "[[X]]").inferred).toBe(info.inferred); // cached identity
    patch.uninstall();
    expect(mtm.getTypeInfo("Team", "[[X]]").inferred).toBe(text);
  });
  it("falls back to original widget when plugin widget throws", () => {
    const { app, text, mtm } = fakeApp();
    const membership: FakeMembership = { knownFieldNames: () => new Set(["team"]), resolve: () => ({ type: "relation", base: "T.base", multiple: false }), on: vi.fn() };
    vi.spyOn(console, "error").mockImplementation(() => {});
    installTypeInfoPatch(app, env(membership), widgets({ relation: () => { throw new Error("boom"); } }));
    mtm.getTypeInfo("Team", "x").inferred.render(div(), "x", ctx("a.md"));
    expect(text.render).toHaveBeenCalledTimes(1);
  });
  it("matches names case-insensitively and gives new identity after refresh", () => {
    const { app, mtm } = fakeApp();
    const membership: FakeMembership = { knownFieldNames: () => new Set(["team"]), resolve: () => null, on: vi.fn() };
    const patch = installTypeInfoPatch(app, env(membership), widgets({}))!;
    const a = mtm.getTypeInfo("team", "x").inferred;
    expect(mtm.getTypeInfo("TEAM", "x").inferred).toBe(a);
    patch.refresh(["team"]);
    expect(mtm.trigger).toHaveBeenCalledWith("changed", "team");
    const b = mtm.getTypeInfo("Team", "x").inferred;
    expect(b).not.toBe(a);
    expect(b.type).toBe("text");
  });
  it("refreshes on membership events and stops listening on uninstall", () => {
    const { app, mtm } = fakeApp();
    const handlers = new Map<string, (...a: unknown[]) => void>();
    const membership: FakeMembership = {
      knownFieldNames: () => new Set(["team"]),
      resolve: () => null,
      on: (n, cb) => { handlers.set(n, cb); return n; },
      offref: (n) => { handlers.delete(n as string); },
    };
    const patch = installTypeInfoPatch(app, env(membership), widgets({}))!;
    expect(mtm.trigger).toHaveBeenCalledTimes(1); // initial refresh on install
    handlers.get("changed")!(["team"]);
    handlers.get("targets-changed")!("T.base");
    expect(mtm.trigger).toHaveBeenCalledTimes(3);
    patch.uninstall();
    expect(handlers.size).toBe(0);
    expect(mtm.trigger).toHaveBeenLastCalledWith("changed", "team");
  });
  it("returns null when internals are missing", () => {
    expect(installTypeInfoPatch({ metadataTypeManager: {} } as unknown as App, {} as WidgetEnv, {} as PluginWidgets)).toBeNull();
  });
});
