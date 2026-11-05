import { describe, it, expect, afterEach } from "vitest";
import { setMockLanguage } from "./__mocks__/obsidian";
import { en } from "../src/i18n/en";
import { de } from "../src/i18n/de";
import { locales, t, tn } from "../src/i18n";

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

afterEach(() => setMockLanguage("en"));

describe("locales", () => {
	it("define every English key and no others", () => {
		for (const [code, locale] of Object.entries(locales)) {
			expect(Object.keys(locale).sort(), code).toEqual(Object.keys(en).sort());
		}
	});

	it("keep the placeholders of the English string", () => {
		for (const [key, text] of Object.entries(en)) {
			expect(placeholders(de[key as keyof typeof en]), key).toEqual(placeholders(text));
		}
	});

	it("pair every _one key with an _other key", () => {
		const keys = Object.keys(en);
		for (const key of keys) {
			if (key.endsWith("_one")) expect(keys, key).toContain(key.replace(/_one$/, "_other"));
			if (key.endsWith("_other")) expect(keys, key).toContain(key.replace(/_other$/, "_one"));
		}
	});
});

describe("t", () => {
	it("fills placeholders and leaves unknown ones", () => {
		expect(t("relation.targetMissing", { base: "A.base" })).toBe("Target base not found: A.base");
		expect(t("relation.viewMissing", { view: "V" })).toBe('View "V" not found in {base}');
	});

	it("follows Obsidian's language, falling back to the base code and then English", () => {
		setMockLanguage("de");
		expect(t("dialog.save")).toBe("Speichern");
		setMockLanguage("de-AT");
		expect(t("dialog.save")).toBe("Speichern");
		setMockLanguage("xx");
		expect(t("dialog.save")).toBe("Save");
	});
});

describe("tn", () => {
	it("picks the singular for 1 and the plural otherwise", () => {
		expect(tn("save.removed", 1, { name: "A" })).toBe("Removed 'A' from 1 note");
		expect(tn("save.removed", 0, { name: "A" })).toBe("Removed 'A' from 0 notes");
		expect(tn("footer.options", 3)).toBe("3 options");
	});
});
