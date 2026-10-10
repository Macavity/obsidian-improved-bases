import { describe, it, expect, afterEach } from "vitest";
import { Platform, type App } from "obsidian";
import { getCliHandler } from "../src/internals/detect";

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
