// Hardcoded schema for the spike. The real plugin would load this from a schema file.

export type FieldSchema =
	| { kind: "relation"; base: string }
	| { kind: "select"; options: Record<string, string> };

export interface EntitySchema {
	folder: string;
	fields: Record<string, FieldSchema>;
}

export const EMPLOYEE_SCHEMA: EntitySchema = {
	folder: "_spike/Employees",
	fields: {
		team: { kind: "relation", base: "_spike/Teams.base" },
		role: {
			kind: "select",
			options: {
				Developer: "blue",
				Designer: "pink",
				"Product Owner": "orange",
				"Scrum Master": "green",
			},
		},
	},
};

export function schemaForPath(path: string): EntitySchema | null {
	return path.startsWith(EMPLOYEE_SCHEMA.folder + "/") ? EMPLOYEE_SCHEMA : null;
}
