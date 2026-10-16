import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App, TFile } from "obsidian";
import { cliQuery, cliQueryAvailable } from "../src/internals/cliQuery";
import { getCliHandler } from "../src/internals/detect";

vi.mock("../src/internals/detect", () => ({ getCliHandler: vi.fn() }));

const handler = vi.fn();
const app = { vault: { getFileByPath: (p: string) => (p === "gone.md" ? null : ({ path: p } as TFile)) } } as unknown as App;

beforeEach(() => {
	handler.mockReset();
	vi.mocked(getCliHandler).mockReturnValue(handler);
});

describe("cliQuery", () => {
	it("queries the whole base and maps paths to existing files", async () => {
		handler.mockResolvedValue("a.md\ngone.md\n\nb.md");
		expect(await cliQuery(app, { base: "M.base" })).toEqual([{ path: "a.md" }, { path: "b.md" }]);
		expect(handler).toHaveBeenCalledWith({ path: "M.base", format: "paths" });
	});

	it("passes the view when set", async () => {
		handler.mockResolvedValue("");
		await cliQuery(app, { base: "M.base", view: "FKs" });
		expect(handler).toHaveBeenCalledWith({ path: "M.base", format: "paths", view: "FKs" });
	});

	it("rejects on error output, unexpected results and a missing handler", async () => {
		handler.mockResolvedValue('Error: View "X" not found');
		await expect(cliQuery(app, { base: "M.base", view: "X" })).rejects.toThrow(/not found/);
		handler.mockResolvedValue(42);
		await expect(cliQuery(app, { base: "M.base" })).rejects.toThrow(/unexpected/);
		vi.mocked(getCliHandler).mockReturnValue(null);
		expect(cliQueryAvailable(app)).toBe(false);
		await expect(cliQuery(app, { base: "M.base" })).rejects.toThrow(/not available/);
	});
});
