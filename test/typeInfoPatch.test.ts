import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import type { TypeInfo, TypeWidget } from "../src/internals/detect";
import { installTypeInfoPatch, type PluginWidgets } from "../src/internals/typeInfoPatch";
import type { Resolution } from "../src/schema/Membership";
import type { FieldSchema } from "../src/schema/types";
import { OverlayRegistry, type PropertyRenderContext, type WidgetEnv } from "../src/widgets/types";

interface FakeMtm {
  registeredTypeWidgets: Record<string, TypeWidget>;
  getTypeInfo(name: string, value: unknown): TypeInfo;
  trigger: ReturnType<typeof vi.fn>;
}
interface FakeMembership {
  knownFieldNames(): Set<string>;
  resolveWithBase(path: string, key: string, preferredBase?: string | null): Resolution | null;
  shapesFor?(name: string): Set<"list" | "scalar" | "native">;
  on(name: string, cb: (...a: unknown[]) => void): unknown;
  offref?(ref: unknown): void;
}

const res = (field: FieldSchema | null, basePath = "T.base", others: Resolution["others"] = []): Resolution | null =>
  field ? { field, basePath, name: "Team", others } : null;
const widget = (type: string) => ({ type, validate: (_v?: unknown): boolean => true, render: vi.fn(() => ({ type, focus() {} })) });

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
      resolveWithBase: (p) => res(p === "a.md" ? { type: "relation", base: "T.base", multiple: false }
        : p === "m.md" ? { type: "multitext" } : p === "u.md" ? { type: "list" } : p === "c.md" ? { type: "constructor" } : null),
      on: vi.fn(),
    };
    const relation = vi.fn(() => ({ type: "relation", focus() {} }));
    const patch = installTypeInfoPatch(app, env(membership), widgets({ relation }))!;
    const info = mtm.getTypeInfo("Team", "[[X]]");
    expect(info.expected).toBe(info.inferred);
    info.inferred.render(div(), "[[X]]", ctx("a.md"));
    info.inferred.render(div(), ["x"], ctx("m.md"));
    info.inferred.render(div(), "y", ctx("other.md"));
    info.inferred.render(div(), "z", ctx("u.md")); // unregistered id: Obsidian's original widget
    info.inferred.render(div(), "z", ctx("c.md")); // prototype member is not a widget either
    expect(relation).toHaveBeenCalledTimes(1);
    expect(multitext.render).toHaveBeenCalledTimes(1);
    expect(text.render).toHaveBeenCalledTimes(3);
    expect(mtm.getTypeInfo("Other", "v").inferred).toBe(text);
    expect(mtm.getTypeInfo("Team", "[[X]]").inferred).toBe(info.inferred); // cached identity
    patch.uninstall();
    expect(mtm.getTypeInfo("Team", "[[X]]").inferred).toBe(text);
  });
  it("passes the base of the surrounding view and marks conflicting definitions", () => {
    const { app, text, mtm } = fakeApp();
    const leafEl = document.body.createDiv();
    (app as unknown as { workspace: unknown }).workspace = {
      iterateAllLeaves: (cb: (l: unknown) => void) => cb({ view: { containerEl: leafEl, getViewType: () => "bases", file: { path: "Mitarbeiter.base", extension: "base" } } }),
    };
    const others: Resolution["others"] = [{ basePath: "Meetings.base", field: { type: "text" } }];
    const resolveWithBase = vi.fn((p: string, _k: string, preferred?: string | null) =>
      p === "cora.md" ? res({ type: "relation", base: "T.base", multiple: true }, preferred ?? "Meetings.base", others) : null);
    const membership: FakeMembership = { knownFieldNames: () => new Set(["team"]), resolveWithBase, on: vi.fn() };
    const relation = vi.fn(() => ({ type: "relation", focus() {} }));
    installTypeInfoPatch(app, env(membership), widgets({ relation }));
    const info = mtm.getTypeInfo("Team", null);
    const cell = leafEl.createDiv();
    info.inferred.render(cell, null, ctx("cora.md"));
    expect(resolveWithBase).toHaveBeenLastCalledWith("cora.md", "Team", "Mitarbeiter.base");
    expect(relation).toHaveBeenCalledTimes(1);
    expect((relation.mock.calls as unknown[][])[0]?.[5]).toEqual({ basePath: "Mitarbeiter.base", name: "Team" });
    const marker = cell.querySelector<HTMLElement>(".improved-bases-conflict");
    expect(marker?.getAttribute("aria-label")).toContain("Meetings.base");
    expect(cell.classList.contains("improved-bases-has-conflict")).toBe(true);
    // A click on the marker stays inside it (no picker, no cell edit).
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    const seenByCell = vi.fn();
    cell.addEventListener("click", seenByCell);
    marker?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(seenByCell).not.toHaveBeenCalled();
    // Outside a Bases view there is no context; the marker still shows.
    const panel = document.body.createDiv();
    info.inferred.render(panel, null, ctx("cora.md"));
    expect(resolveWithBase).toHaveBeenLastCalledWith("cora.md", "Team", null);
    expect(panel.querySelector(".improved-bases-conflict")).not.toBeNull();
    // No conflict, no marker; a native override with a conflict gets one too.
    const plain = vi.fn(() => res({ type: "relation", base: "T.base", multiple: true }));
    membership.resolveWithBase = plain;
    const quiet = document.body.createDiv();
    info.inferred.render(quiet, null, ctx("ada.md"));
    expect(quiet.querySelector(".improved-bases-conflict")).toBeNull();
    membership.resolveWithBase = () => res({ type: "text" }, "Meetings.base", [{ basePath: "Mitarbeiter.base", field: { type: "relation", base: "T.base", multiple: true } }]);
    const native = document.body.createDiv();
    info.inferred.render(native, null, ctx("cora.md"));
    expect(text.render).toHaveBeenCalled();
    expect(native.querySelector(".improved-bases-conflict")).not.toBeNull();
  });
  it("re-checks the view context once a cell rendered detached is attached", () => {
    vi.useFakeTimers();
    try {
      const { app, text, mtm } = fakeApp();
      const leafEl = document.body.createDiv();
      (app as unknown as { workspace: unknown }).workspace = {
        iterateAllLeaves: (cb: (l: unknown) => void) => cb({ view: { containerEl: leafEl, getViewType: () => "bases", file: { path: "Meetings.base", extension: "base" } } }),
      };
      const relationField: FieldSchema = { type: "relation", base: "T.base", multiple: true };
      const textField: FieldSchema = { type: "text" };
      // Path rule: Meetings (text) first; in the Meetings view the same winner, in the Mitarbeiter view the relation.
      const resolveWithBase = vi.fn((_p: string, _k: string, preferred?: string | null) =>
        preferred === "Mitarbeiter.base"
          ? res(relationField, "Mitarbeiter.base", [{ basePath: "Meetings.base", field: textField }])
          : res(textField, "Meetings.base", [{ basePath: "Mitarbeiter.base", field: relationField }]));
      const membership: FakeMembership = { knownFieldNames: () => new Set(["team"]), resolveWithBase, on: vi.fn() };
      const relation = vi.fn(() => ({ type: "relation", focus() {} }));
      installTypeInfoPatch(app, env(membership), widgets({ relation }));
      const info = mtm.getTypeInfo("Team", null);
      // Same winner: only the marker text changes once the context is known.
      const cell = document.createElement("div");
      info.inferred.render(cell, null, ctx("cora.md"));
      expect(cell.querySelector(".improved-bases-conflict")?.getAttribute("aria-label")).toContain("first by path");
      leafEl.appendChild(cell);
      vi.runAllTimers();
      expect(cell.querySelector(".improved-bases-conflict")?.getAttribute("aria-label")).toContain("Showing Meetings.base");
      expect(cell.querySelectorAll(".improved-bases-conflict")).toHaveLength(1);
      expect(text.render).toHaveBeenCalledTimes(1);
      // Different winner: the cell is rendered again with the other definition.
      (app as unknown as { workspace: unknown }).workspace = {
        iterateAllLeaves: (cb: (l: unknown) => void) => cb({ view: { containerEl: leafEl, getViewType: () => "bases", file: { path: "Mitarbeiter.base", extension: "base" } } }),
      };
      const cell2 = document.createElement("div");
      const handle = info.inferred.render(cell2, null, ctx("cora.md")) as { focus(): void };
      expect(text.render).toHaveBeenCalledTimes(2);
      leafEl.appendChild(cell2);
      vi.runAllTimers();
      expect(relation).toHaveBeenCalledTimes(1);
      expect(cell2.querySelector(".improved-bases-conflict")?.getAttribute("aria-label")).toContain("Showing Mitarbeiter.base");
      expect(() => handle.focus()).not.toThrow();
      // A cell that never attaches is left alone.
      const orphan = document.createElement("div");
      info.inferred.render(orphan, null, ctx("cora.md"));
      vi.runAllTimers();
      expect(text.render).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("renders a native override value its widget rejects with the original widget and a marker", () => {
    const { app, text, mtm } = fakeApp();
    Object.assign(text, { name: "Text" });
    const number = { ...widget("number"), name: () => "Zahl", validate: (v?: unknown) => typeof v === "number" };
    mtm.registeredTypeWidgets.number = number;
    const membership: FakeMembership = { knownFieldNames: () => new Set(["status"]), resolveWithBase: () => res({ type: "number" }), on: vi.fn() };
    installTypeInfoPatch(app, env(membership), widgets({}));
    const info = mtm.getTypeInfo("Status", "Aktiv");
    const cell = div();
    info.inferred.render(cell, "Aktiv", ctx("a.md", "Status"));
    expect(number.render).not.toHaveBeenCalled();
    expect(text.render).toHaveBeenCalledWith(cell, "Aktiv", expect.anything());
    const marker = cell.querySelector<HTMLElement>(".improved-bases-mismatch");
    expect(marker?.getAttribute("aria-label")).toBe('"Aktiv" is not a valid Zahl; shown as Text until edited');
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    marker?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
  it("renders the native override widget for valid and empty values without a marker", () => {
    const { app, text, mtm } = fakeApp();
    const number = { ...widget("number"), validate: (v?: unknown) => typeof v === "number" };
    mtm.registeredTypeWidgets.number = number;
    const membership: FakeMembership = { knownFieldNames: () => new Set(["status"]), resolveWithBase: () => res({ type: "number" }), on: vi.fn() };
    installTypeInfoPatch(app, env(membership), widgets({}));
    const info = mtm.getTypeInfo("Status", 3);
    for (const value of [3, null, undefined, ""]) {
      const cell = div();
      info.inferred.render(cell, value, ctx("a.md", "Status"));
      expect(cell.querySelector(".improved-bases-mismatch")).toBeNull();
    }
    expect(number.render).toHaveBeenCalledTimes(4);
    expect(text.render).not.toHaveBeenCalled();
  });
  it("falls back to original widget when plugin widget throws", () => {
    const { app, text, mtm } = fakeApp();
    const membership: FakeMembership = { knownFieldNames: () => new Set(["team"]), resolveWithBase: () => res({ type: "relation", base: "T.base", multiple: false }), on: vi.fn() };
    vi.spyOn(console, "error").mockImplementation(() => {});
    installTypeInfoPatch(app, env(membership), widgets({ relation: () => { throw new Error("boom"); } }));
    mtm.getTypeInfo("Team", "x").inferred.render(div(), "x", ctx("a.md"));
    expect(text.render).toHaveBeenCalledTimes(1);
  });
  it("matches names case-insensitively and gives new identity after refresh", () => {
    const { app, mtm } = fakeApp();
    const membership: FakeMembership = { knownFieldNames: () => new Set(["team"]), resolveWithBase: () => null, on: vi.fn() };
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
      resolveWithBase: () => null,
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
  it("validates by the value shapes the schemas allow for the field name", () => {
    const { app, text, mtm } = fakeApp();
    const orig = vi.fn((v: unknown) => typeof v === "number");
    text.validate = orig;
    const shapes: Record<string, Set<"list" | "scalar" | "native">> = {
      tags: new Set(["list"]), team: new Set(["scalar"]), n: new Set(["native"]),
    };
    const membership: FakeMembership = {
      knownFieldNames: () => new Set(Object.keys(shapes)),
      resolveWithBase: () => null,
      shapesFor: (n) => shapes[n] ?? new Set(),
      on: vi.fn(),
    };
    installTypeInfoPatch(app, env(membership), widgets({}));
    const v = (name: string, value: unknown) => mtm.getTypeInfo(name, value).expected.validate(value);
    expect(v("Tags", ["a", "b"])).toBe(true);
    expect(v("Tags", [])).toBe(true);
    expect(v("Tags", null)).toBe(true);
    expect(v("Tags", "a")).toBe(false); // no list/scalar match -> original validate
    expect(v("Tags", [1])).toBe(false);
    expect(v("Team", "x")).toBe(true);
    expect(v("Team", null)).toBe(true);
    expect(v("Team", ["x"])).toBe(false);
    expect(v("N", "x")).toBe(false);
    expect(v("N", 3)).toBe(true);
  });
  it("returns null when internals are missing", () => {
    expect(installTypeInfoPatch({ metadataTypeManager: {} } as unknown as App, {} as WidgetEnv, {} as PluginWidgets)).toBeNull();
  });
});
