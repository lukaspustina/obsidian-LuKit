import { describe, it, expect } from "vitest";
import { transformLinkLine } from "../../src/features/office-previews/office-previews-engine";

const matches = (lp: string): boolean => lp === "Angebot.docx";

describe("SDD office-previews p1 c10 link-line", () => {
	it("converts a plain embed to a link", () => {
		expect(transformLinkLine("![[Angebot.docx]]", matches)).toEqual({ line: "[[Angebot.docx]]", matched: true });
	});

	it("keeps a text alias", () => {
		expect(transformLinkLine("![[Angebot.docx|alias]]", matches)).toEqual({ line: "[[Angebot.docx|alias]]", matched: true });
	});

	it("drops a numeric size suffix", () => {
		expect(transformLinkLine("![[Angebot.docx|300]]", matches)).toEqual({ line: "[[Angebot.docx]]", matched: true });
	});

	it("keeps the heading", () => {
		expect(transformLinkLine("![[Angebot.docx#S]]", matches)).toEqual({ line: "[[Angebot.docx#S]]", matched: true });
	});

	it("returns a plain link unchanged but matched", () => {
		expect(transformLinkLine("[[Angebot.docx]]", matches)).toEqual({ line: "[[Angebot.docx]]", matched: true });
	});

	it("converts only the first of two matching embeds", () => {
		expect(transformLinkLine("![[Angebot.docx]] und ![[Angebot.docx]]", matches)).toEqual({
			line: "[[Angebot.docx]] und ![[Angebot.docx]]",
			matched: true,
		});
	});

	it("leaves a line with a non-matching embed unchanged and unmatched", () => {
		expect(transformLinkLine("![[Other.docx]]", matches)).toEqual({ line: "![[Other.docx]]", matched: false });
	});
});
