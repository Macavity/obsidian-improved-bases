import { describe, it, expect } from "vitest";
import { TFile, type App } from "obsidian";
import { KNOWN_ICONS } from "./__mocks__/obsidian";
import { DEFAULT_ICON, entryIcon, renderIcon } from "../src/widgets/icons";

const appWith = (fm: Record<string, unknown> | undefined) =>
  ({ metadataCache: { getFileCache: () => (fm ? { frontmatter: fm } : null) } }) as unknown as App;
describe("entryIcon", () => {
  it("prefers the file property, then the base default, then 📄", () => {
    const f = new TFile();
    expect(entryIcon(appWith({ icon: "👤" }), f, "👥")).toBe("👤");
    expect(entryIcon(appWith({ icon: "  " }), f, "👥")).toBe("👥");
    expect(entryIcon(appWith({ icon: ["x"] }), f, null)).toBe(DEFAULT_ICON);
    expect(entryIcon(appWith({ icon: ["x"] }), f, " ")).toBe(DEFAULT_ICON);
    expect(entryIcon(appWith(undefined), null, null)).toBe(DEFAULT_ICON);
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
