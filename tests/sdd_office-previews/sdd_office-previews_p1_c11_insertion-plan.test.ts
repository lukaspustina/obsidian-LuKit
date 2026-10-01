import { describe, it, expect } from "vitest";
import { planPreviewInsertion } from "../../src/features/office-previews/office-previews-engine";

const isSourceLink = (lp: string): boolean => lp === "Angebot.docx";
const isPreviewLink = (lp: string): boolean => lp === "Angebot.docx.png";
const embedText = "![[Angebot.docx.png]]";

const plan = (content: string): ReturnType<typeof planPreviewInsertion> =>
	planPreviewInsertion(content, isSourceLink, isPreviewLink, embedText);

describe("SDD office-previews p1 c11", () => {
	it("copies the leading whitespace of a list item link line without a bullet", () => {
		const content = "# Title\n\n  - ![[Angebot.docx]]\nafter";

		expect(plan(content)).toEqual({
			lineIndex: 2,
			replacement: "  - [[Angebot.docx]]\n  ![[Angebot.docx.png]]",
		});
	});

	it("leaves a plain link line unchanged and only adds the embed line", () => {
		expect(plan("intro\n[[Angebot.docx]]\nend")).toEqual({
			lineIndex: 1,
			replacement: "[[Angebot.docx]]\n![[Angebot.docx.png]]",
		});
	});

	it("returns null when no line links the source", () => {
		expect(plan("# Title\n\n![[Other.docx]]\n[[Angebot.docx.png]] text")).toBeNull();
	});

	it("returns null when an embed of the preview exists anywhere", () => {
		const content = "![[Angebot.docx.png]]\n\ntext\n![[Angebot.docx]]";

		expect(plan(content)).toBeNull();
	});

	it("chooses the first of two matching embed lines", () => {
		const content = "a\n![[Angebot.docx]]\nb\n![[Angebot.docx]]";

		expect(plan(content)).toEqual({
			lineIndex: 1,
			replacement: "[[Angebot.docx]]\n![[Angebot.docx.png]]",
		});
	});

	it("produces a valid plan for the link on the last line without trailing newline", () => {
		expect(plan("intro\n![[Angebot.docx]]")).toEqual({
			lineIndex: 1,
			replacement: "[[Angebot.docx]]\n![[Angebot.docx.png]]",
		});
	});

	it("handles a link on the first line", () => {
		expect(plan("![[Angebot.docx]]")).toEqual({
			lineIndex: 0,
			replacement: "[[Angebot.docx]]\n![[Angebot.docx.png]]",
		});
	});
});
