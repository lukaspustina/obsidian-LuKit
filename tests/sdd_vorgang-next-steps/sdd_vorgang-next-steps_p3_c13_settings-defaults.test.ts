// ownNames (global) and besprechung.nextStepHeadings do not exist on
// LuKitSettings/DEFAULT_SETTINGS yet — accessing them below yields
// `undefined`, so the equality assertions against their documented defaults
// fail. That is the correct RED state for this criterion (req. 13, 21, 22).
import { describe, it, expect } from "vitest";
import { mergeSettings, DEFAULT_SETTINGS } from "../../src/types";

describe("ownNames and besprechung.nextStepHeadings settings defaults (SDD vorgang-next-steps p3 c13, req. 13, 21, 22)", () => {
	it("DEFAULT_SETTINGS carries ownNames: [] and besprechung.nextStepHeadings: ['Nächste Schritte']", () => {
		expect(DEFAULT_SETTINGS.ownNames).toEqual([]);
		expect(DEFAULT_SETTINGS.besprechung.nextStepHeadings).toEqual(["Nächste Schritte"]);
	});

	it("mergeSettings({}) yields both defaults", () => {
		const merged = mergeSettings({});
		expect(merged.ownNames).toEqual([]);
		expect(merged.besprechung.nextStepHeadings).toEqual(["Nächste Schritte"]);
	});

	it("defaults ownNames and besprechung.nextStepHeadings for a stored blob lacking both fields", () => {
		const merged = mergeSettings({
			besprechung: { folderPath: "Meetings" } as never,
		});
		expect(merged.ownNames).toEqual([]);
		expect(merged.besprechung.nextStepHeadings).toEqual(["Nächste Schritte"]);
	});

	it("leaves besprechung.selfNameStopwords untouched in name and default (req. 22)", () => {
		expect(DEFAULT_SETTINGS.besprechung.selfNameStopwords).toEqual([]);
		const merged = mergeSettings({});
		expect(merged.besprechung.selfNameStopwords).toEqual([]);
	});
});
