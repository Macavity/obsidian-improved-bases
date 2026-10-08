import { describe, it, expect, vi } from "vitest";
import type { TFile } from "obsidian";
import { Membership } from "../src/schema/Membership";
import type { SchemaRegistry } from "../src/schema/SchemaRegistry";
import type { BaseQuery } from "../src/query/BaseQuery";
import { parseSchema } from "../src/schema/parse";
import type { BaseSchema } from "../src/schema/types";

const file = (path: string) => ({ path }) as TFile;

function setup(initial?: BaseSchema[]) {
	const s = (path: string, fields: Record<string, unknown>) => {
		const r = parseSchema(path, { "improved-bases": { fields } }).schema;
		if (!r) throw new Error("invalid fixture");
		return r;
	};
	let schemas = initial ?? [
		s("B-Meetings.base", { Team: { type: "text" } }),
		s("A-People.base", { Team: { type: "relation", base: "Teams.base" } }),
	];
	const handlers = new Set<() => void>();
	const registry = {
		schemas: () => [...schemas].sort((a, b) => a.basePath.localeCompare(b.basePath)),
		on: (_n: string, cb: () => void) => void handlers.add(cb),
		off: (_n: string, cb: () => void) => void handlers.delete(cb),
	} as unknown as SchemaRegistry;
	const pushes = new Map<string, (f: TFile[]) => void>();
	const unwatched: string[] = [];
	const query = {
		watch: (p: string, cb: (f: TFile[]) => void) => {
			pushes.set(p, cb);
			return () => void unwatched.push(p);
		},
		dispose: () => {},
	} as BaseQuery;
	const m = new Membership(registry, query);
	const push = (p: string, paths: string[]) => pushes.get(p)?.(paths.map(file));
	const setSchemas = (next: BaseSchema[]) => {
		schemas = next;
		for (const h of handlers) h();
	};
	return { m, push, s, setSchemas, unwatched, pushes };
}

describe("Membership", () => {
	it("is null until every schema base scanned", () => {
		const { m, push } = setup();
		push("A-People.base", ["p/ada.md"]);
		expect(m.ready).toBe(false);
		expect(m.resolve("p/ada.md", "team")).toBeNull();
		push("B-Meetings.base", []);
		expect(m.ready).toBe(true);
		expect(m.resolve("p/ada.md", "TEAM")?.type).toBe("relation");
	});
	it("first base by path wins and warns once", () => {
		const { m, push } = setup();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		push("A-People.base", ["x.md"]);
		push("B-Meetings.base", ["x.md"]);
		expect(m.resolve("x.md", "team")?.type).toBe("relation");
		m.resolve("x.md", "team");
		expect(warn).toHaveBeenCalledTimes(1);
		expect(m.schemaBaseOf("x.md")?.basePath).toBe("A-People.base");
		warn.mockRestore();
	});
	it("emits changed with affected field names", () => {
		const { m, push } = setup();
		const cb = vi.fn();
		m.on("changed", cb);
		push("A-People.base", []);
		push("B-Meetings.base", []);
		expect(cb).toHaveBeenLastCalledWith(["team"]);
	});
	it("emits on membership change once ready", () => {
		const { m, push } = setup();
		push("A-People.base", []);
		push("B-Meetings.base", []);
		const cb = vi.fn();
		m.on("changed", cb);
		push("B-Meetings.base", ["m.md"]);
		expect(cb).toHaveBeenCalledWith(["team"]);
		expect(m.resolve("m.md", "team")?.type).toBe("text");
		expect(m.resolve("none.md", "team")).toBeNull();
	});
	it("reports target entries; null until scanned", () => {
		const { m, push } = setup();
		expect(m.targetEntries("Teams.base")).toBeNull();
		push("Teams.base", ["Teams/a.md"]);
		expect(m.targetEntries("Teams.base")?.map((f) => f.path)).toEqual(["Teams/a.md"]);
	});
	it("reacts to schema changes and unwatches removed bases", () => {
		const { m, push, s, setSchemas, unwatched } = setup();
		push("A-People.base", ["p.md"]);
		push("B-Meetings.base", []);
		const cb = vi.fn();
		m.on("changed", cb);
		setSchemas([s("A-People.base", { Role: { type: "text" } })]);
		expect(cb).toHaveBeenCalledWith(expect.arrayContaining(["team", "role"]));
		expect(unwatched).toContain("B-Meetings.base");
		expect(m.resolve("p.md", "team")).toBeNull();
		expect(m.knownFieldNames()).toEqual(new Set(["role"]));
	});
	it("dispose detaches", () => {
		const { m, unwatched } = setup();
		m.dispose();
		expect(unwatched).toContain("A-People.base");
	});
});
