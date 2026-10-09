import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import type { App, EventRef } from "obsidian";
import { SchemaRegistry } from "../src/schema/SchemaRegistry";

function baseFile(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.extension = "base";
	return f;
}

function fakeApp(contents: Map<string, () => Promise<string>>) {
	const handlers: Array<{ name: string; cb: (...a: unknown[]) => unknown }> = [];
	const offs: unknown[] = [];
	const files = new Map([...contents.keys()].map((p) => [p, baseFile(p)]));
	const app = {
		vault: {
			on: (name: string, cb: (...a: unknown[]) => unknown) => {
				const ref = { name, cb };
				handlers.push(ref);
				return ref as unknown as EventRef;
			},
			offref: (ref: unknown) => void offs.push(ref),
			getFiles: () => [...files.values()],
			getAbstractFileByPath: (p: string) => files.get(p) ?? null,
			cachedRead: (f: TFile) => contents.get(f.path)!(),
		},
	} as unknown as App;
	return { app, handlers, offs, fire: (name: string, ...a: unknown[]) => handlers.filter((h) => h.name === name).forEach((h) => h.cb(...a)), files };
}

const yaml = (label: string) => `improved-bases:\n  fields:\n    ${label}:\n      type: text\n`;

describe("SchemaRegistry", () => {
	it("does not register events when load() runs after dispose()", async () => {
		const { app, handlers } = fakeApp(new Map());
		const r = new SchemaRegistry(app);
		r.dispose();
		await r.load();
		expect(handlers).toHaveLength(0);
	});
	it("registers events once on repeated load()", async () => {
		const { app, handlers } = fakeApp(new Map());
		const r = new SchemaRegistry(app);
		await r.load();
		const n = handlers.length;
		await r.load();
		expect(handlers).toHaveLength(n);
		expect(n).toBeGreaterThan(0);
	});
	it("reports loaded only after load()", async () => {
		const { app } = fakeApp(new Map());
		const r = new SchemaRegistry(app);
		expect(r.loaded).toBe(false);
		await r.load();
		expect(r.loaded).toBe(true);
	});
	it("discards stale parallel refreshes for the same path", async () => {
		let release!: (v: string) => void;
		const slow = new Promise<string>((res) => (release = res));
		const calls: Array<() => Promise<string>> = [() => slow, () => Promise.resolve(yaml("Fresh"))];
		let i = 0;
		const contents = new Map<string, () => Promise<string>>();
		const { app, fire, files } = fakeApp(contents);
		const r = new SchemaRegistry(app);
		await r.load();
		contents.set("A.base", () => calls[i++]!());
		files.set("A.base", baseFile("A.base"));
		fire("modify", files.get("A.base"));
		fire("modify", files.get("A.base"));
		await Promise.resolve();
		await Promise.resolve();
		release(yaml("Stale"));
		await new Promise((res) => setTimeout(res, 0));
		expect([...(r.schemas()[0]?.fields.keys() ?? [])]).toEqual(["fresh"]);
	});
	it("drops the schema when a base is renamed to another extension", async () => {
		const { app, fire, files } = fakeApp(new Map([["A.base", () => Promise.resolve(yaml("X"))]]));
		const r = new SchemaRegistry(app);
		await r.load();
		expect(r.schemas()).toHaveLength(1);
		files.delete("A.base");
		const renamed = new TFile();
		renamed.path = "A.txt";
		renamed.extension = "txt";
		fire("rename", renamed, "A.base");
		await new Promise((res) => setTimeout(res, 0));
		expect(r.schemas()).toHaveLength(0);
	});
});
