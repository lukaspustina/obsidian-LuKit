import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const isSource = (p: string): boolean => p === "a.docx";
const isImage = (p: string): boolean => p === "_previews/_resources/a.docx.png";
const isPreview = (p: string): boolean => p.startsWith("_previews/");
const EMBED = "![a.docx.png](_previews/_resources/a.docx.png)";

const plan = (content: string) => planAutoEmbed(content, isSource, isImage, isPreview, EMBED);

describe("SDD office-previews-auto-embed p4 c2", () => {
	it("treats a Markdown embed of another preview as part of the block", () => {
		const other = "![](_previews/_resources/Neue%20Datei.docx.png)";
		const result = plan(`[[a.docx]]\n${other}\n`);
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(1);
		expect(result?.text).toBe(EMBED);
		expect(result?.newContent).toBe(`[[a.docx]]\n${other}\n${EMBED}\n`);
	});

	it("returns null when the body embeds the image as <angle-bracket> target with a title", () => {
		expect(plan('[[a.docx]]\n![x](<_previews/_resources/a.docx.png> "Titel")\n')).toBeNull();
	});
});
