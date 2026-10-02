import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c5", () => {
	it("copies only the leading whitespace of an indented list line that embeds the source", () => {
		const content = "  - ![[a.docx]]";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.text).toBe("  ![[a.docx.png]]");
	});

	it("leaves the list line unchanged and inserts the embed line below it", () => {
		const content = "  - ![[a.docx]]";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.newContent).toBe("  - ![[a.docx]]\n  ![[a.docx.png]]");
	});
});
