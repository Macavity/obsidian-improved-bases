import { describe, it, expect, vi } from "vitest";
import { WarningRegistry } from "../src/warnings/WarningRegistry";

describe("WarningRegistry", () => {
	it("reports state warnings idempotently and resolves them", () => {
		const r = new WarningRegistry();
		const changed = vi.fn();
		r.on("changed", changed);
		r.report("schema:A.base", { text: "bad", bases: ["A.base"] });
		r.report("schema:A.base", { text: "bad", bases: ["A.base"] });
		expect(changed).toHaveBeenCalledTimes(1);
		expect(r.count).toBe(1);
		expect(r.list()[0]).toMatchObject({ id: "schema:A.base", kind: "state", text: "bad", bases: ["A.base"] });
		r.report("schema:A.base", { text: "worse", bases: ["A.base"] });
		expect(changed).toHaveBeenCalledTimes(2);
		r.resolve("schema:A.base");
		r.resolve("schema:A.base");
		expect(changed).toHaveBeenCalledTimes(3);
		expect(r.count).toBe(0);
	});
	it("replaces a source's state warnings, keeping unchanged ones and other sources", () => {
		const r = new WarningRegistry();
		r.report("plugin:x", { text: "p" });
		r.replace("schema", [{ id: "A.base", text: "a" }, { id: "B.base", text: "b" }]);
		const first = r.list().find((w) => w.id === "schema:A.base")!;
		const changed = vi.fn();
		r.on("changed", changed);
		r.replace("schema", [{ id: "A.base", text: "a" }, { id: "B.base", text: "b" }]);
		expect(changed).not.toHaveBeenCalled();
		r.replace("schema", [{ id: "A.base", text: "a" }]);
		expect(changed).toHaveBeenCalledTimes(1);
		expect(r.list().map((w) => w.id).sort()).toEqual(["plugin:x", "schema:A.base"]);
		expect(r.list().find((w) => w.id === "schema:A.base")!.at).toBe(first.at);
		r.replace("schema", []);
		expect(r.list().map((w) => w.id)).toEqual(["plugin:x"]);
	});
	it("keeps event warnings until dismissed and never replaces them", () => {
		const r = new WarningRegistry();
		const id = r.push({ text: "3 failed", bases: ["A.base"] });
		r.replace("event", []);
		expect(r.count).toBe(1);
		expect(r.forBase("A.base").map((w) => w.kind)).toEqual(["event"]);
		expect(r.forBase("B.base")).toEqual([]);
		r.dismiss(id);
		expect(r.count).toBe(0);
	});
	it("lists newest first", () => {
		vi.useFakeTimers();
		const r = new WarningRegistry();
		r.report("a", { text: "a" });
		vi.advanceTimersByTime(10);
		r.push({ text: "b" });
		expect(r.list().map((w) => w.text)).toEqual(["b", "a"]);
		vi.useRealTimers();
	});
});
