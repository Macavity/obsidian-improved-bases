export const COLORS = ["red", "orange", "yellow", "green", "lime", "cyan", "blue", "violet", "pink", "brown", "grey", "black", "white"] as const;
export type Color = typeof COLORS[number];
export const isColor = (v: unknown): v is Color => typeof v === "string" && (COLORS as readonly string[]).includes(v);
/** `view` names the target base's view that decides which entries and columns the picker offers; absent = default view. */
export interface RelationField { type: "relation"; base: string; multiple: boolean; view?: string }
export interface SelectOption { value: string; color: Color }
export interface SelectField { type: "select"; multiple: boolean; options: SelectOption[] }
/** Obsidian's property type id (`text`, `multitext`, …, or one registered by a plugin); never `relation` or `select`. */
export interface NativeField { type: string }
export type FieldSchema = RelationField | SelectField | NativeField;
export interface BaseSchema {
	basePath: string;
	/** Default icon of this base's entries wherever a relation shows them; undefined = 📄. */
	icon?: string;
	/** key = lowercased property name */
	fields: Map<string, { name: string; field: FieldSchema }>;
}
export const SCHEMA_KEY = "improved-bases";
/** Narrowing helpers: a native type id is any other string, so `field.type === "relation"` alone does not narrow. */
export const isRelation = (f: FieldSchema): f is RelationField => f.type === "relation";
export const isSelect = (f: FieldSchema): f is SelectField => f.type === "select";
