import { describe, it, expect } from "vitest";
import { isUnsafeKey } from "../src/schema/keys";

describe("isUnsafeKey", () => {
  it("flags reserved names case-insensitively", () => {
    for (const k of ["__proto__", "Constructor", "PROTOTYPE"]) expect(isUnsafeKey(k)).toBe(true);
    expect(isUnsafeKey("Team")).toBe(false);
  });
});
