import { describe, it, expect, afterEach } from "vitest";
import { Platform, type App } from "obsidian";
import { getCliHandler, getMetadataTypeManager } from "../src/internals/detect";

const app = (cli: unknown): App => ({ cli }) as unknown as App;
const handler = () => "ok";

afterEach(() => {
	Platform.isDesktop = true;
});

describe("getCliHandler", () => {
	it("returns the registered handler", () => {
		const handlers = new Map([["eval", { handler }]]);
		expect(getCliHandler(app({ handlers }), "eval")).toBe(handler);
	});
	it("returns null when internals are missing or malformed", () => {
		expect(getCliHandler(app(undefined), "eval")).toBeNull();
		expect(getCliHandler(app({}), "eval")).toBeNull();
		expect(getCliHandler(app({ handlers: { get: 1 } }), "eval")).toBeNull();
		expect(getCliHandler(app({ handlers: new Map() }), "eval")).toBeNull();
		expect(getCliHandler(app({ handlers: new Map([["eval", { handler: "nope" }]]) }), "eval")).toBeNull();
		expect(getCliHandler(app({ handlers: { get: () => { throw new Error("boom"); } } }), "eval")).toBeNull();
	});
	it("is desktop-only", () => {
		Platform.isDesktop = false;
		expect(getCliHandler(app({ handlers: new Map([["eval", { handler }]]) }), "eval")).toBeNull();
	});
});

describe("getMetadataTypeManager", () => {
	const widget = { type: "text", validate: () => true, render: () => null };
	const mtm = { registeredTypeWidgets: { text: widget }, getTypeInfo: () => null, trigger: () => {} };
	it("accepts a manager without setType", () => {
		expect(getMetadataTypeManager({ metadataTypeManager: mtm } as unknown as App)).toBe(mtm);
	});
	it("rejects a manager without getTypeInfo", () => {
		expect(getMetadataTypeManager({ metadataTypeManager: { ...mtm, getTypeInfo: undefined } } as unknown as App)).toBeNull();
	});
});
