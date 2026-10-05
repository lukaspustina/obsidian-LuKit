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

	it("keeps a malformed URL-encoded Markdown embed target as written", () => {
		const isRaw = (p: string): boolean => p === "x%E0%A4%A.png";
		const result = planAutoEmbed("[[a.docx]]\n![](x%E0%A4%A.png)\n", isSource, isRaw, isPreview, "![[a.docx.png]]");
		expect(result).toBeNull();
	});

	it("keeps balanced parentheses in a Markdown embed target", () => {
		const isCopy = (p: string): boolean => p === "Angebot (1).docx";
		const isCopyImage = (p: string): boolean => p === "_previews/Angebot (1).docx.png";
		const embedded = "[[Angebot (1).docx]]\n![x](_previews/Angebot%20(1).docx.png)\n";
		expect(planAutoEmbed(embedded, isCopy, isCopyImage, isPreview, "![x](_previews/Angebot%20(1).docx.png)")).toBeNull();
		const block = planAutoEmbed(
			"[[a.docx]]\n![](_previews/Angebot%20(1).docx.png)\ntext\n",
			isSource,
			isImage,
			(p) => p.startsWith("_previews/"),
			"![[a.docx.png]]",
		);
		expect(block?.lineIndex).toBe(1);
	});

	it("skips a fenced block nested in a list item (tab or 4-space indent)", () => {
		for (const indent of ["\t", "    "]) {
			const note = `- Beispiel:\n${indent}\`\`\`\n${indent}[[a.docx]]\n${indent}![[a.docx.png]]\n${indent}\`\`\`\n\nSiehe [[a.docx]]\n`;
			expect(plan(note)?.lineIndex).toBe(6);
		}
	});

	it("treats an unclosed frontmatter block as body", () => {
		expect(plan("---\n[[a.docx]]\n")?.newContent).toBe("---\n[[a.docx]]\n![[a.docx.png]]\n");
	});
});
