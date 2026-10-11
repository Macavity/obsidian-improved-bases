import { describe, it, expect } from "vitest";
import { KNOWN_ICONS, TFile, type App } from "obsidian";
import { DEFAULT_ICON, entryIcon, renderIcon } from "../src/widgets/icons";

const appWith = (fm: Record<string, unknown> | undefined) =>
  ({ metadataCache: { getFileCache: () => (fm ? { frontmatter: fm } : null) } }) as unknown as App;
const field = { type: "relation", base: "T.base", multiple: false } as const;

describe("entryIcon", () => {
  it("prefers the file property, then the field default, then 📄", () => {
    const f = new TFile();
    expect(entryIcon(appWith({ icon: "👤" }), f, { ...field, icon: "👥" })).toBe("👤");
    expect(entryIcon(appWith({ icon: "  " }), f, { ...field, icon: "👥" })).toBe("👥");
    expect(entryIcon(appWith({ icon: ["x"] }), f, field)).toBe(DEFAULT_ICON);
    expect(entryIcon(appWith(undefined), null, field)).toBe(DEFAULT_ICON);
  });
});
describe("renderIcon", () => {
  it("renders text, or a built-in icon when Obsidian knows the name", () => {
    const text = document.body.createSpan();
    renderIcon(text, "📄");
    expect(text.textContent).toBe("📄");
    expect(text.className).toContain("is-text");
    KNOWN_ICONS.add("lucide-book");
    const svg = document.body.createSpan();
    renderIcon(svg, "book");
    expect(svg.getAttribute("data-icon")).toBe("lucide-book");
    expect(svg.textContent).toBe("");
  });
});
