import { describe, it, expect } from "vitest";
import type { RawFields } from "../src/schema/SchemaWriter";
import type { SelectField } from "../src/schema/types";
import { selectOutput, colorOf, addOptionMutation, setColorMutation } from "../src/widgets/values";

const field: SelectField = { type: "select", multiple: false, options: [{ value: "Dev", color: "blue" }] };
const fresh = (): RawFields => ({ Role: { type: "select", options: { Dev: "blue" } } });

describe("select values", () => {
  it("writes schema format", () => {
    expect(selectOutput(["Dev"], false)).toBe("Dev");
    expect(selectOutput(["Dev", "PO"], true)).toEqual(["Dev", "PO"]);
    expect(selectOutput([], false)).toBeNull();
  });
  it("colors unknown values grey", () => {
    expect(colorOf(field, "Dev")).toBe("blue");
    expect(colorOf(field, "Nope")).toBe("grey");
  });
  it("adds options without duplicates and recolors", () => {
    const f = fresh();
    addOptionMutation("Role", "PO")(f); addOptionMutation("Role", "PO")(f);
    expect(f.Role?.options).toEqual({ Dev: "blue", PO: "grey" });
    setColorMutation("Role", "PO", "green")(f);
    expect((f.Role?.options as Record<string, string>).PO).toBe("green");
  });
  it("keeps an existing color when adding", () => {
    const f = fresh();
    addOptionMutation("Role", "Dev")(f);
    expect((f.Role?.options as Record<string, string>).Dev).toBe("blue");
  });
});
