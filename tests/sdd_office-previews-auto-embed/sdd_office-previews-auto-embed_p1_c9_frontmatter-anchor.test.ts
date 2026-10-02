import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

describe("SDD office-previews-auto-embed p1 c9", () => {
	it("anchors on the body line when the link also appears in frontmatter", () => {
		const frontmatter = '---\nrelated: "[[a.docx]]"\n---\n';
		const content = `${frontmatter}Intro\nsee [[a.docx]] here\nend`;
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(4);
		expect(plan?.text).toBe("![[a.docx.png]]");
		expect(plan?.newContent).toBe(`${frontmatter}Intro\nsee [[a.docx]] here\n![[a.docx.png]]\nend`);
	});

	it("leaves the frontmatter byte-identical", () => {
		const frontmatter = '---\nrelated: "[[a.docx]]"\ntags: [x]\n---\n';
		const content = `${frontmatter}[[a.docx]]\n`;
		const plan = planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");
		expect(plan?.newContent.startsWith(frontmatter)).toBe(true);
		expect(plan?.lineIndex).toBe(4);
	});
});
