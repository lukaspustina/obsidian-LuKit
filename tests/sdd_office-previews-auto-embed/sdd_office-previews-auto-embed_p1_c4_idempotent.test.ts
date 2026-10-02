import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const plan = (content: string) =>
	planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");

describe("SDD office-previews-auto-embed p1 c4", () => {
	it("returns null when the body already embeds the image", () => {
		expect(plan("see [[a.docx]] for details\n![[a.docx.png]]\n")).toBeNull();
	});

	it("returns a plan when the note only contains a plain link to the image", () => {
		const result = plan("see [[a.docx]] for details\n[[a.docx.png]]\n");
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(0);
		expect(result?.text).toBe("![[a.docx.png]]");
		expect(result?.newContent).toBe("see [[a.docx]] for details\n![[a.docx.png]]\n[[a.docx.png]]\n");
	});

	it("returns a plan when the image embed only sits inside a fenced block", () => {
		const content = "```\n![[a.docx.png]]\n```\nsee [[a.docx]]\n";
		const result = plan(content);
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(3);
		expect(result?.text).toBe("![[a.docx.png]]");
		expect(result?.newContent).toBe("```\n![[a.docx.png]]\n```\nsee [[a.docx]]\n![[a.docx.png]]\n");
	});
});
