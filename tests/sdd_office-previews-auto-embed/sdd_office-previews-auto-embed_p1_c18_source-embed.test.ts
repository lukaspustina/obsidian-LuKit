import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c18", () => {
	it("plans an embed for a source-only embed, then returns null once the image embed is present", () => {
		const content = "![[a.docx]]";
		const first = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");

		expect(first).not.toBeNull();
		expect(first?.lineIndex).toBe(0);
		expect(first?.text).toBe("![[a.docx.png]]");
		expect(first?.newContent).toBe("![[a.docx]]\n![[a.docx.png]]");

		const second = planAutoEmbed(
			first?.newContent ?? "",
			src("a.docx"),
			img("a.docx.png"),
			isPreview,
			"![[a.docx.png]]",
		);
		expect(second).toBeNull();
	});
});
