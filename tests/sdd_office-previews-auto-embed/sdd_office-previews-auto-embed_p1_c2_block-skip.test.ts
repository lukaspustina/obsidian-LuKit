import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c2", () => {
	const content = "Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[a.docx.png]]";

	it("inserts after the existing preview-embed block, so lineIndex is 1", () => {
		const plan = planAutoEmbed(content, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(1);
	});

	it("puts the new embed line below the existing one without touching other lines", () => {
		const plan = planAutoEmbed(content, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]");
		expect(plan?.text).toBe("![[b.xlsx.png]]");
		expect(plan?.newContent).toBe(
			"Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[a.docx.png]]\n![[b.xlsx.png]]",
		);
	});
});
