export const COLORS = ["red", "orange", "yellow", "green", "lime", "cyan", "blue", "violet", "pink", "brown", "grey", "black", "white"] as const;
export type Color = typeof COLORS[number];
export type NativeType = "text" | "list" | "number" | "checkbox" | "date" | "datetime";
export interface RelationField { type: "relation"; base: string; multiple: boolean }
export interface SelectOption { value: string; color: Color }
export interface SelectField { type: "select"; multiple: boolean; options: SelectOption[] }
export interface NativeField { type: NativeType }
export type FieldSchema = RelationField | SelectField | NativeField;
export interface BaseSchema {
  basePath: string;
  /** key = lowercased property name */
  fields: Map<string, { name: string; field: FieldSchema }>;
}
export const SCHEMA_KEY = "improved-bases";
export const NATIVE_TYPES: readonly NativeType[] = ["text", "list", "number", "checkbox", "date", "datetime"];
