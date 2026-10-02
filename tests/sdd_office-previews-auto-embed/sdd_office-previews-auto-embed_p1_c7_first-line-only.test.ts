import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c7", () => {
	it("embeds only below the first line linking the source", () => {
		const content = "first [[a.docx]]\nmiddle\nsecond [[a.docx]]\n";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("![[a.docx.png]]");
		expect(plan?.newContent).toBe("first [[a.docx]]\n![[a.docx.png]]\nmiddle\nsecond [[a.docx]]\n");
	});

	it("inserts exactly one embed even when the links are on adjacent lines", () => {
		const content = "[[a.docx]]\n[[a.docx]]\n";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan?.newContent).toBe("[[a.docx]]\n![[a.docx.png]]\n[[a.docx]]\n");
		expect(plan?.newContent.match(/!\[\[a\.docx\.png\]\]/g)).toHaveLength(1);
	});
});
