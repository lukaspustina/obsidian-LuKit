import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c10", () => {
	it("keeps the quote prefix on the inserted embed line", () => {
		const content = "> [[a.docx]]\n\nende";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("> ![[a.docx.png]]");
		expect(plan?.newContent).toBe("> [[a.docx]]\n> ![[a.docx.png]]\n\nende");
	});

	it("recognises a quoted preview-embed block and inserts after it", () => {
		const content = "> [[a.docx]] [[b.xlsx]]\n> ![[a.docx.png]]\n\nende";
		const plan = planAutoEmbed(content, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(1);
		expect(plan?.text).toBe("> ![[b.xlsx.png]]");
		expect(plan?.newContent).toBe(
			"> [[a.docx]] [[b.xlsx]]\n> ![[a.docx.png]]\n> ![[b.xlsx.png]]\n\nende",
		);
	});
});
