import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c13", () => {
	it("uses CRLF for the inserted EOL in a CRLF note and leaves no bare LF", () => {
		const content = "intro\r\n[[a.docx]]\r\nmore\r\n";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.newContent).toBe("intro\r\n[[a.docx]]\r\n![[a.docx.png]]\r\nmore\r\n");
		expect(plan?.newContent.replace(/\r\n/g, "")).not.toContain("\n");
	});

	it("keeps a note without trailing newline free of a trailing newline", () => {
		const content = "x\n[[a.docx]]";
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(1);
		expect(plan?.newContent).toBe("x\n[[a.docx]]\n![[a.docx.png]]");
	});
});
