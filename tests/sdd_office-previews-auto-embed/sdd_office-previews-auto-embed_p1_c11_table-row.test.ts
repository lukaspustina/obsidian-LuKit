import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);
const EMBED = "![[a.docx.png]]";

describe("SDD office-previews-auto-embed p1 c11", () => {
	it("inserts after the last contiguous table row with no prefix", () => {
		const content = ["| [[a.docx]] | x |", "| b | y |", "text"].join("\n");
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, EMBED);
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(1);
		expect(plan?.text).toBe(EMBED);
		expect(plan?.newContent).toBe(
			["| [[a.docx]] | x |", "| b | y |", EMBED, "text"].join("\n"),
		);
	});

	it("inserts after a preview embed that directly follows the last table row", () => {
		const content = [
			"| [[a.docx]] | x |",
			"| b | y |",
			"![[b.xlsx.png]]",
			"text",
		].join("\n");
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, EMBED);
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(2);
		expect(plan?.text).toBe(EMBED);
		expect(plan?.newContent).toBe(
			["| [[a.docx]] | x |", "| b | y |", "![[b.xlsx.png]]", EMBED, "text"].join("\n"),
		);
	});
});
