import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EventRef, MetadataCache } from "obsidian";
import type { TFile } from "obsidian";
import { Membership } from "../src/schema/Membership";
import type { SchemaRegistry } from "../src/schema/SchemaRegistry";
import type { BaseQuery } from "../src/query/BaseQuery";
import { parseSchema } from "../src/schema/parse";
import type { BaseSchema } from "../src/schema/types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const settle = () => vi.advanceTimersByTime(300);

const file = (path: string) => ({ path }) as TFile;

const s0 = (path: string, fields: Record<string, unknown>): BaseSchema => {
	const r = parseSchema(path, { "improved-bases": { fields } }).schema;
	if (!r) throw new Error("invalid fixture");
	return r;
};

function setup(initial?: BaseSchema[], opts: { cache?: boolean; loaded?: boolean } = {}) {
	let loaded = opts.loaded ?? true;
	const cacheHandlers = new Set<() => void>();
	const cache = {
		resolvedLinks: {},
		on: (_n: string, cb: () => void) => {
			cacheHandlers.add(cb);
			return { cb } as unknown as EventRef;
		},
		offref: () => {},
	} as unknown as MetadataCache;
	const fireResolved = () => {
		for (const h of cacheHandlers) h();
	};
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
		get loaded() {
			return loaded;
		},
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
	const m = new Membership(registry, query, opts.cache ? { cache } : {});
	const push = (p: string, paths: string[]) => pushes.get(p)?.(paths.map(file));
	const setSchemas = (next: BaseSchema[]) => {
		schemas = next;
		for (const h of handlers) h();
	};
	const setLoaded = () => {
		loaded = true;
		for (const h of handlers) h();
	};
	return { m, push, s, setSchemas, unwatched, pushes, fireResolved, setLoaded };
}

describe("Membership", () => {
	it("shapesFor collects value shapes per field name", () => {
		const { m } = setup([
			s0("A.base", { Team: { type: "relation", base: "T.base" }, Tags: { type: "select", multiple: true }, N: { type: "number" } }),
			s0("B.base", { Team: { type: "select", multiple: true } }),
		]);
		expect([...m.shapesFor("team")].sort()).toEqual(["list", "scalar"]);
		expect([...m.shapesFor("tags")]).toEqual(["list"]);
		expect([...m.shapesFor("n")]).toEqual(["native"]);
		expect(m.shapesFor("zzz").size).toBe(0);
	});
	it("is null until every schema base scanned", () => {
		const { m, push } = setup();
		push("A-People.base", ["p/ada.md"]);
		expect(m.ready).toBe(false);
		expect(m.resolve("p/ada.md", "team")).toBeNull();
		push("B-Meetings.base", []);
		expect(m.ready).toBe(false);
		settle();
		expect(m.ready).toBe(true);
		expect(m.resolve("p/ada.md", "TEAM")?.type).toBe("relation");
	});
	it("first base by path wins and warns once", () => {
		const { m, push } = setup();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		push("A-People.base", ["x.md"]);
		push("B-Meetings.base", ["x.md"]);
		settle();
		expect(m.resolve("x.md", "team")?.type).toBe("relation");
		m.resolve("x.md", "team");
		expect(warn).toHaveBeenCalledTimes(1);
		expect(m.resolveWithBase("x.md", "TEAM")).toMatchObject({ basePath: "A-People.base", name: "Team" });
		warn.mockRestore();
	});
	it("prefers the given base when it is a candidate and lists the other definitions", () => {
		const { m, push } = setup();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		push("A-People.base", ["x.md"]);
		push("B-Meetings.base", ["x.md"]);
		settle();
		const byPath = m.resolveWithBase("x.md", "team");
		expect(byPath?.basePath).toBe("A-People.base");
		expect(byPath?.others.map((o) => [o.basePath, o.field.type])).toEqual([["B-Meetings.base", "text"]]);
		const preferred = m.resolveWithBase("x.md", "team", "B-Meetings.base");
		expect(preferred?.basePath).toBe("B-Meetings.base");
		expect(preferred?.field.type).toBe("text");
		expect(preferred?.others.map((o) => o.basePath)).toEqual(["A-People.base"]);
		// Not a candidate: the path rule applies.
		expect(m.resolveWithBase("x.md", "team", "Z.base")?.basePath).toBe("A-People.base");
		expect(m.resolve("x.md", "team", "B-Meetings.base")?.type).toBe("text");
	});
	it("resolveWithBase reports the winning base and the schema spelling", () => {
		const sch = (path: string, name: string) => {
			const r = parseSchema(path, { "improved-bases": { fields: { [name]: { type: "text" } } } }).schema;
			if (!r) throw new Error("invalid fixture");
			return r;
		};
		const { m, push } = setup([sch("Meetings.base", "TEAM"), sch("Mitarbeiter.base", "team")]);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(m.resolveWithBase("Mitarbeiter/Cora Conrad.md", "team")).toBeNull();
		push("Meetings.base", ["Mitarbeiter/Cora Conrad.md"]);
		push("Mitarbeiter.base", ["Mitarbeiter/Cora Conrad.md"]);
		settle();
		const r = m.resolveWithBase("Mitarbeiter/Cora Conrad.md", "Team");
		expect(r?.basePath).toBe("Meetings.base");
		expect(r?.name).toBe("TEAM");
		expect(m.resolveWithBase("other.md", "team")).toBeNull();
	});
	it("emits changed with affected field names", () => {
		const { m, push } = setup();
		const cb = vi.fn();
		m.on("changed", cb);
		push("A-People.base", []);
		push("B-Meetings.base", []);
		settle();
		expect(cb).toHaveBeenLastCalledWith(["team"]);
	});
	it("emits on membership change once ready", () => {
		const { m, push } = setup();
		push("A-People.base", []);
		push("B-Meetings.base", []);
		settle();
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
		settle();
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
	it("latches only after a quiet period without new pushes", () => {
		const { m, push } = setup();
		push("A-People.base", []);
		push("B-Meetings.base", []);
		vi.advanceTimersByTime(200);
		push("B-Meetings.base", ["partial.md"]);
		vi.advanceTimersByTime(200);
		expect(m.ready).toBe(false);
		expect(m.resolve("partial.md", "team")).toBeNull();
		vi.advanceTimersByTime(100);
		expect(m.ready).toBe(true);
	});
	it("waits for the metadata cache to resolve", () => {
		const { m, push, fireResolved } = setup(undefined, { cache: true });
		push("A-People.base", []);
		push("B-Meetings.base", []);
		vi.advanceTimersByTime(1000);
		expect(m.ready).toBe(false);
		fireResolved();
		settle();
		expect(m.ready).toBe(true);
	});
	it("is not ready before the registry loaded", () => {
		const { m, push, setLoaded } = setup(undefined, { loaded: false });
		push("A-People.base", []);
		push("B-Meetings.base", []);
		vi.advanceTimersByTime(1000);
		expect(m.ready).toBe(false);
		setLoaded();
		settle();
		expect(m.ready).toBe(true);
	});
	it("is not vacuously ready with zero schemas", () => {
		const { m } = setup([]);
		vi.advanceTimersByTime(1000);
		expect(m.ready).toBe(false);
	});
	it("emits targets-changed when a relation target base changes", () => {
		const { m, push } = setup();
		push("A-People.base", []);
		push("B-Meetings.base", []);
		settle();
		const cb = vi.fn();
		const other = vi.fn();
		m.on("targets-changed", cb);
		m.on("changed", other);
		push("Teams.base", ["t.md"]);
		expect(cb).toHaveBeenCalledWith("Teams.base");
	});
});
