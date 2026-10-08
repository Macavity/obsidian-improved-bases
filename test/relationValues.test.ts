import { describe, it, expect } from "vitest";
import { toList, relationOutput, linkTarget } from "../src/widgets/values";

describe("relation values", () => {
  it("normalizes input", () => {
    expect(toList(null)).toEqual([]);
    expect(toList("[[A]]")).toEqual(["[[A]]"]);
    expect(toList(["[[A]]", "[[B]]"])).toEqual(["[[A]]", "[[B]]"]);
  });
  it("writes schema format", () => {
    expect(relationOutput(["[[A]]"], false)).toBe("[[A]]");
    expect(relationOutput(["[[A]]", "[[B]]"], true)).toEqual(["[[A]]", "[[B]]"]);
    expect(relationOutput([], false)).toBeNull();
    expect(relationOutput([], true)).toEqual([]);
  });
  it("extracts link targets", () => {
    expect(linkTarget("[[Team A|Alias]]")).toBe("Team A");
    expect(linkTarget("[[Team A#H]]")).toBe("Team A");
    expect(linkTarget("plain")).toBeNull();
  });
});
