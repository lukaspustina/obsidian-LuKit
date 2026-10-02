import { describe, it, expect, vi } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c15", () => {
	it("counts a link with heading and alias as a link to the source", () => {
		const content = "see [[a.docx#h|alias]] here";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("![[a.docx.png]]");
		expect(plan?.newContent).toBe("see [[a.docx#h|alias]] here\n![[a.docx.png]]");
	});

	it("passes the bare path to the resolver for heading and alias", () => {
		const resolver = vi.fn((p: string): boolean => p === "a.docx");
		planAutoEmbed("[[a.docx#h|alias]]", resolver, img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(resolver).toHaveBeenCalledWith("a.docx");
		expect(resolver).not.toHaveBeenCalledWith("a.docx#h|alias");
	});

	it("unescapes the pipe in a table row, passes a.docx to the resolver and counts the link", () => {
		const resolver = vi.fn((p: string): boolean => p === "a.docx");
		const content = "| [[a.docx\\|alias]] | x |\ntext";
		const plan = planAutoEmbed(content, resolver, img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(resolver).toHaveBeenCalledWith("a.docx");
		expect(resolver).not.toHaveBeenCalledWith("a.docx\\");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("![[a.docx.png]]");
		expect(plan?.newContent).toBe("| [[a.docx\\|alias]] | x |\n![[a.docx.png]]\ntext");
	});
});
