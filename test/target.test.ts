import { describe, it, expect } from "vitest";
import { targetKey } from "../src/query/target";

describe("targetKey", () => {
  it("keys targets by base and view", () => {
    expect(targetKey({ base: "M.base" })).toBe("M.base");
    expect(targetKey({ base: "M.base", view: "FKs" })).toBe("M.base#FKs");
  });
});
