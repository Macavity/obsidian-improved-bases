import { describe, it, expect } from "vitest";
import { canActivate } from "../src/commands/activateSchema";

const reg = (loaded: boolean, known: boolean) => ({
  loaded,
  schemas: () => (known ? [{ basePath: "A.base" }] : []),
  errors: () => new Map<string, string[]>(),
});

describe("canActivate", () => {
  it("requires a loaded registry", () => {
    expect(canActivate(reg(false, false), "A.base")).toBe(false);
    expect(canActivate(reg(true, false), "A.base")).toBe(true);
    expect(canActivate(reg(true, true), "A.base")).toBe(false);
  });
});
