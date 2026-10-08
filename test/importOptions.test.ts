import { describe, it, expect } from "vitest";
import { planImport, importMutation } from "../src/commands/importOptions";
import type { RawFields } from "../src/schema/SchemaWriter";

describe("planImport", () => {
  it("maps notes to select options for present columns", () => {
    const plan = planImport(
      [
        { basename: "Role - Developer", farbe: "blue" },
        { basename: "Role - Product Owner", farbe: "purple" },
        { basename: "Language Preference - German", farbe: "red" },
        { basename: "Gruppe - Gruppe 1", farbe: "blue" },
        { basename: "Kaputt", farbe: "red" },
      ],
      new Set(["role", "language preference"]),
      ["Role_pill", "Language_Preference_pill", "dept_via_team"],
    );
    expect(plan.fields).toEqual({
      Role: { Developer: "blue", "Product Owner": "grey" },
      "Language Preference": { German: "red" },
    });
    expect(plan.skipped.join(" ")).toMatch(/Product Owner/);
    expect(plan.skipped.join(" ")).toMatch(/Kaputt/);
    expect(plan.obsoleteFormulas).toEqual(["Role_pill", "Language_Preference_pill"]);
  });

  it("first note wins on duplicates, missing color is grey, only first ' - ' splits", () => {
    const plan = planImport(
      [
        { basename: "Role - A - B", farbe: "red" },
        { basename: "role - A - B", farbe: "blue" },
        { basename: "Role - C", farbe: undefined },
      ],
      new Set(["role"]),
      [],
    );
    expect(plan.fields).toEqual({ Role: { "A - B": "red", C: "grey" } });
    expect(plan.skipped.join(" ")).toMatch(/C/);
  });
});

describe("importMutation", () => {
  it("adds options, keeps existing colors, creates missing fields", () => {
    const fields: RawFields = { role: { type: "select", multiple: false, options: { Developer: "pink" } } };
    importMutation({ Role: { Developer: "blue", Designer: "red" }, Status: { Aktiv: "green" } }, new Set(["Status"]))(fields);
    expect(fields.role?.options).toEqual({ Developer: "pink", Designer: "red" });
    expect(fields.Status).toEqual({ type: "select", multiple: true, options: { Aktiv: "green" } });
  });

  it("does not touch non-select fields", () => {
    const fields: RawFields = { Role: { type: "relation", base: "T.base" } };
    importMutation({ Role: { A: "red" } }, new Set())(fields);
    expect(fields.Role).toEqual({ type: "relation", base: "T.base" });
  });
});
