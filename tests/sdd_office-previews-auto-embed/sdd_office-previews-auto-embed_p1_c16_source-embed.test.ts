import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c16", () => {
	it("returns a plan for a note containing only an embed of the source document", () => {
		const plan = planAutoEmbed(
			"![[a.docx]]",
			src("a.docx"),
			img("a.docx.png"),
			isPreview,
			"![[a.docx.png]]",
		);
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("![[a.docx.png]]");
	});

	it("keeps the anchor line as the source embed and appends the image embed below", () => {
		const plan = planAutoEmbed(
			"![[a.docx]]",
			src("a.docx"),
			img("a.docx.png"),
			isPreview,
			"![[a.docx.png]]",
		);
		expect(plan?.newContent).toBe("![[a.docx]]\n![[a.docx.png]]");
	});
});
