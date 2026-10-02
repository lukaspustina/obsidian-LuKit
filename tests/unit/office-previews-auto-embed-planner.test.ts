import { describe, expect, it } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const isSource = (p: string): boolean => p === "a.docx";
const isImage = (p: string): boolean => p === "a.docx.png";
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);
const plan = (content: string): ReturnType<typeof planAutoEmbed> =>
	planAutoEmbed(content, isSource, isImage, isPreview, "![[a.docx.png]]");

describe("planAutoEmbed edge cases", () => {
	it("does not close a single-backtick span at a longer backtick run", () => {
		expect(plan("`x`` [[a.docx]] `\n")).toBeNull();
		expect(plan("`x``y` [[a.docx]]\n")?.lineIndex).toBe(0);
	});

	it("reads ```[[x]]``` as an inline span, not as an opening fence", () => {
		expect(plan("```[[b.docx]]```\n[[a.docx]]\n")?.lineIndex).toBe(1);
	});

	it("does not close a fence at a fence line carrying an info string", () => {
		expect(plan("```\n```js\n[[a.docx]]\n```\n")).toBeNull();
	});

	it("skips a fenced block inside a blockquote", () => {
		expect(plan("> ```\n> [[a.docx]]\n> ```\n")).toBeNull();
		expect(plan("> ```\n> x\n> ```\n> [[a.docx]]\n")?.text).toBe("> ![[a.docx.png]]");
	});

	it("inserts after the last row of a table inside a blockquote, keeping the prefix", () => {
		expect(plan("> | [[a.docx]] | x |\n> | y | z |\nend")?.newContent).toBe(
			"> | [[a.docx]] | x |\n> | y | z |\n> ![[a.docx.png]]\nend",
		);
	});

	it("treats an unclosed frontmatter block as body", () => {
		expect(plan("---\n[[a.docx]]\n")?.newContent).toBe("---\n[[a.docx]]\n![[a.docx.png]]\n");
	});
});
