import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c3", () => {
	it("inserts the embed below a line with an inline link and leaves the line unchanged", () => {
		const content = "see [[a.docx]] for details";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("![[a.docx.png]]");
		expect(plan?.newContent).toBe("see [[a.docx]] for details\n![[a.docx.png]]");
	});

	it("keeps surrounding lines intact when the inline link line is in the middle", () => {
		const content = "intro\nsee [[a.docx]] for details\noutro\n";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan?.lineIndex).toBe(1);
		expect(plan?.newContent).toBe("intro\nsee [[a.docx]] for details\n![[a.docx.png]]\noutro\n");
	});
});
