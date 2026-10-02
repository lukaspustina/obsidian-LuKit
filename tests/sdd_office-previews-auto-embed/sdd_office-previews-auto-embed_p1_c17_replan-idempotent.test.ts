import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe("SDD office-previews-auto-embed p1 c17", () => {
	it("re-planning the c2 plan's newContent yields null", () => {
		const content = "Anhänge: ![[a.docx]], ![[b.xlsx]]\n![[a.docx.png]]\n";
		const first = planAutoEmbed(content, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]");
		expect(first).not.toBeNull();
		const next = first!.newContent;
		expect(occurrences(next, "![[b.xlsx.png]]")).toBe(1);
		expect(planAutoEmbed(next, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]")).toBeNull();
	});

	it("re-planning the table shape's newContent yields null", () => {
		const content = "| [[a.docx]] | x |\n| y | z |\ntext\n";
		const first = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(first).not.toBeNull();
		const next = first!.newContent;
		expect(occurrences(next, "![[a.docx.png]]")).toBe(1);
		expect(planAutoEmbed(next, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]")).toBeNull();
	});

	it("re-planning the quote shape's newContent yields null", () => {
		const content = "> [[a.docx]]\n";
		const first = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(first).not.toBeNull();
		const next = first!.newContent;
		expect(occurrences(next, "![[a.docx.png]]")).toBe(1);
		expect(planAutoEmbed(next, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]")).toBeNull();
	});

	it("re-planning the CRLF shape's newContent yields null", () => {
		const content = "intro\r\n[[a.docx]]\r\n";
		const first = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(first).not.toBeNull();
		const next = first!.newContent;
		expect(occurrences(next, "![[a.docx.png]]")).toBe(1);
		expect(planAutoEmbed(next, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]")).toBeNull();
	});
});
