import { getLanguage } from "obsidian";
import { en } from "./en";
import { de } from "./de";
import type { TranslationKey } from "./en";

export type { TranslationKey } from "./en";
export type Locale = Record<TranslationKey, string>;

/** Every bundled locale, keyed by Obsidian's language code (`getLanguage()`). Add a language here. */
export const locales: Record<string, Locale> = { en, de };

/** Keys that exist as a `_one` / `_other` pair; `tn()` picks one by count. */
type Suffix<K extends string, S extends string> = K extends `${infer Base}_${S}` ? Base : never;
type OneKey = Suffix<TranslationKey, "one">;
type OtherKey = Suffix<TranslationKey, "other">;
export type PluralKey = OneKey extends OtherKey ? OneKey : never;

type Params = Record<string, string | number>;

const fill = (text: string, params?: Params): string =>
	params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;

/** The locale for Obsidian's current language: exact code, then its base (`zh` for `zh-TW`), then English. */
function currentLocale(): Locale {
	let code = "en";
	try {
		code = getLanguage();
	} catch {
		// Older typings or a test double without the function: English.
	}
	return locales[code] ?? locales[code.split("-")[0] ?? ""] ?? en;
}

/** The string for `key` in Obsidian's language, with `{name}` placeholders filled from `params`. */
export function t(key: TranslationKey, params?: Params): string {
	return fill(currentLocale()[key] ?? en[key], params);
}

/** Picks `key_one` or `key_other` by `n` and fills `{n}` plus `params`. */
export function tn(key: PluralKey, n: number, params?: Params): string {
	const full = `${key}_${n === 1 ? "one" : "other"}` as TranslationKey;
	return t(full, { ...params, n });
}
