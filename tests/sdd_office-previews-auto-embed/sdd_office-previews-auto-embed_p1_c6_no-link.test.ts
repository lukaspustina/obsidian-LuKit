import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const plan = (content: string) =>
	planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");

describe("SDD office-previews-auto-embed p1 c6", () => {
	it("returns null when no line links the source", () => {
		const content = "# Titel\n\nKein Link hier.\n[[b.xlsx]] und [[andere Notiz]]\n";
		expect(plan(content)).toBeNull();
	});

	it("returns null for an empty note", () => {
		expect(plan("")).toBeNull();
	});

	it("positive control: a note that links the source yields a plan", () => {
		const result = plan("# Titel\n\nsiehe [[a.docx]] hier\n");
		expect(result).not.toBeNull();
		expect(result?.lineIndex).toBe(2);
		expect(result?.text).toBe("![[a.docx.png]]");
		expect(result?.newContent).toBe("# Titel\n\nsiehe [[a.docx]] hier\n![[a.docx.png]]\n");
	});
});
