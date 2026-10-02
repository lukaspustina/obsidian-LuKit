import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const plan = (content: string): ReturnType<typeof planAutoEmbed> =>
	planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");

describe("SDD office-previews-auto-embed p1 c12", () => {
	it("copies a leading tab of the anchor line", () => {
		const result = plan("\t[[a.docx]]");
		expect(result?.text).toBe("\t![[a.docx.png]]");
		expect(result?.lineIndex).toBe(0);
	});

	it("gives an ordered list line a flush embed without a marker", () => {
		const result = plan("1. [[a.docx]]");
		expect(result?.text).toBe("![[a.docx.png]]");
		expect(result?.newContent).toBe("1. [[a.docx]]\n![[a.docx.png]]");
	});

	it("gives a top-level bullet line a flush embed without a marker", () => {
		const result = plan("- [[a.docx]]");
		expect(result?.text).toBe("![[a.docx.png]]");
		expect(result?.newContent).toBe("- [[a.docx]]\n![[a.docx.png]]");
	});
});
