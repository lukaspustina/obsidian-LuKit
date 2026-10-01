import { describe, it, expect } from "vitest";
import {
	matchDrop,
	DROP_WINDOW_MS,
	type DropRecord,
} from "../../src/features/office-previews/office-previews-engine";

const NOW = 1_000_000;

function rec(notePath: string, names: string[], at: number): DropRecord {
	return { notePath, names: [...names], at };
}

describe("SDD office-previews p1 c12 match-drop", () => {
	it("uses a 10 s drop window", () => {
		expect(DROP_WINDOW_MS).toBe(10_000);
	});

	it("matches the exact name", () => {
		const r = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r], "Angebot.docx", NOW)).toBe(r);
	});

	it("returns null when there are no records or no name matches", () => {
		expect(matchDrop([], "Angebot.docx", NOW)).toBeNull();
		const r = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r], "Bericht.docx", NOW)).toBeNull();
	});

	it("matches Obsidian collision suffixes of the form '<stem> <digits>.<ext>'", () => {
		const r1 = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r1], "Angebot 1.docx", NOW)).toBe(r1);
		const r2 = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r2], "Angebot 12.docx", NOW)).toBe(r2);
	});

	it("does not match a hyphen suffix or a different extension", () => {
		const r = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r], "Angebot-1.docx", NOW)).toBeNull();
		expect(matchDrop([r], "Angebot 1.pdf", NOW)).toBeNull();
		expect(r.names).toEqual(["Angebot.docx"]);
	});

	it("lets the most recent record win among several matches", () => {
		const older = rec("old.md", ["Angebot.docx"], NOW - 5000);
		const newer = rec("new.md", ["Angebot.docx"], NOW - 2000);
		expect(matchDrop([older, newer], "Angebot.docx", NOW)).toBe(newer);
		const older2 = rec("old.md", ["Angebot.docx"], NOW - 5000);
		const newer2 = rec("new.md", ["Angebot.docx"], NOW - 2000);
		expect(matchDrop([newer2, older2], "Angebot.docx", NOW)).toBe(newer2);
	});

	it("ignores a record older than the window and accepts one exactly at the boundary", () => {
		const tooOld = rec("a.md", ["Angebot.docx"], NOW - 10_001);
		expect(matchDrop([tooOld], "Angebot.docx", NOW)).toBeNull();
		const boundary = rec("a.md", ["Angebot.docx"], NOW - 10_000);
		expect(matchDrop([boundary], "Angebot.docx", NOW)).toBe(boundary);
	});

	it("falls back to an in-window record when a newer one does not match", () => {
		const other = rec("b.md", ["Bericht.docx"], NOW - 1000);
		const match = rec("a.md", ["Angebot.docx"], NOW - 4000);
		expect(matchDrop([match, other], "Angebot.docx", NOW)).toBe(match);
	});

	it("consumes the matched name so a second call with the same basename returns null", () => {
		const r = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r], "Angebot.docx", NOW)).toBe(r);
		expect(r.names).toEqual([]);
		expect(matchDrop([r], "Angebot.docx", NOW)).toBeNull();
	});

	it("keeps the other names of a multi-file record matchable after one is consumed", () => {
		const r = rec("a.md", ["Angebot.docx", "Folien.pptx"], NOW - 1000);
		expect(matchDrop([r], "Angebot.docx", NOW)).toBe(r);
		expect(r.names).toEqual(["Folien.pptx"]);
		expect(matchDrop([r], "Folien.pptx", NOW)).toBe(r);
		expect(r.names).toEqual([]);
		expect(matchDrop([r], "Folien.pptx", NOW)).toBeNull();
	});

	it("consumes the recorded name, not the suffixed created name", () => {
		const r = rec("a.md", ["Angebot.docx"], NOW - 1000);
		expect(matchDrop([r], "Angebot 1.docx", NOW)).toBe(r);
		expect(r.names).toEqual([]);
	});
});
