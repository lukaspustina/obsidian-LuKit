import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const plan = (content: string) =>
	planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");

describe("SDD office-previews-auto-embed p1 c14", () => {
	it("does not count an unrelated embed below the anchor as part of the block", () => {
		const result = plan("see [[a.docx]]\n![[photo.jpg]]\nend");
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(0);
		expect(result?.text).toBe("![[a.docx.png]]");
		expect(result?.newContent).toBe("see [[a.docx]]\n![[a.docx.png]]\n![[photo.jpg]]\nend");
	});

	it("ends the block at a blank line", () => {
		const result = plan("[[a.docx]]\n![[b.docx.png]]\n\n![[c.docx.png]]\nend");
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(1);
		expect(result?.newContent).toBe(
			"[[a.docx]]\n![[b.docx.png]]\n![[a.docx.png]]\n\n![[c.docx.png]]\nend",
		);
	});

	it("includes a preview embed carrying a size in the block", () => {
		const result = plan("[[a.docx]]\n![[x.docx.png|200]]\ntext");
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(1);
		expect(result?.newContent).toBe("[[a.docx]]\n![[x.docx.png|200]]\n![[a.docx.png]]\ntext");
	});
});
