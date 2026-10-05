import { describe, expect, it } from "vitest";
import { planAutoEmbed, transformLinkLine } from "../../src/features/office-previews/office-previews-engine";

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

	it("resolves a link written with decomposed umlauts (NFD) like Obsidian does", () => {
		const nfc = "Bestätigung.docx";
		const nfd = nfc.normalize("NFD");
		const isNfcSource = (p: string): boolean => p === nfc;
		const isNfcImage = (p: string): boolean => p === `${nfc}.png`;
		const anchored = planAutoEmbed(`siehe [[${nfd}|${nfd}]]\n`, isNfcSource, isNfcImage, isPreview, `![[${nfc}.png]]`);
		expect(anchored?.lineIndex).toBe(0);
		const embedded = planAutoEmbed(`[[${nfc}]]\n![[${nfd}.png]]\n`, isNfcSource, isNfcImage, isPreview, `![[${nfc}.png]]`);
		expect(embedded).toBeNull();
	});

	it("matches an NFD link on the drop path and keeps its original text", () => {
		const nfd = "Bestätigung.docx".normalize("NFD");
		const result = transformLinkLine(`![[${nfd}]]`, (p) => p === "Bestätigung.docx");
		expect(result).toEqual({ line: `[[${nfd}]]`, matched: true });
	});

	it("anchors and recognises sources whose file name contains brackets", () => {
		const name = "[Entwurf] Angebot.docx";
		const isBracketSource = (p: string): boolean => p === name || p === `_resources/${name}`;
		const isBracketImage = (p: string): boolean => p === `${name}.png`;
		const embedText = `![[${name}.png]]`;
		expect(planAutoEmbed(`![[${name}]]\n`, isBracketSource, isBracketImage, isPreview, embedText)?.lineIndex).toBe(0);
		expect(planAutoEmbed(`[[_resources/${name}|${name}]]\n`, isBracketSource, isBracketImage, isPreview, embedText)?.lineIndex).toBe(0);
		expect(planAutoEmbed(`![[${name}]]\n${embedText}\n`, isBracketSource, isBracketImage, isPreview, embedText)).toBeNull();
		const block = planAutoEmbed(`[[a.docx]]\n![[${name}.png]]\ntext\n`, isSource, isImage, isPreview, "![[a.docx.png]]");
		expect(block?.lineIndex).toBe(1);
	});

	it("recognises Markdown embed titles in double quotes, single quotes and parentheses", () => {
		const isCopy = (p: string): boolean => p === "Angebot (1).docx";
		const isCopyImage = (p: string): boolean => p === "_previews/Angebot (1).docx.png";
		const embedOf = (title: string): ReturnType<typeof planAutoEmbed> =>
			planAutoEmbed(
				`[[Angebot (1).docx]]\n![](_previews/Angebot%20(1).docx.png ${title})\n`,
				isCopy,
				isCopyImage,
				isPreview,
				"![](_previews/Angebot%20(1).docx.png)",
			);
		expect(embedOf('"T"')).toBeNull();
		expect(embedOf("'T'")).toBeNull();
		expect(embedOf("(T)")).toBeNull();
		expect(embedOf("(T")).not.toBeNull();
		expect(plan("[[a.docx]]\n![](<other doc.docx.png> 'T')\ntext\n")?.lineIndex).toBe(1);
		expect(plan("[[a.docx]]\n![](other.docx.png (T))\ntext\n")?.lineIndex).toBe(1);
	});

	it("treats an unclosed frontmatter block as body", () => {
		expect(plan("---\n[[a.docx]]\n")?.newContent).toBe("---\n[[a.docx]]\n![[a.docx.png]]\n");
	});
});
