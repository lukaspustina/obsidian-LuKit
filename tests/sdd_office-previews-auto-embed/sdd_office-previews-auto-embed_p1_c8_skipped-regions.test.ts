import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const plan = (content: string) =>
	planAutoEmbed(content, src("a.docx"), img("a.docx.png"), isPreview, "![[a.docx.png]]");

const BODY = "Siehe [[a.docx]] fuer Details";

describe("SDD office-previews-auto-embed p1 c8", () => {
	it("returns null when the only link is in YAML frontmatter", () => {
		expect(plan("---\nattachment: [[a.docx]]\n---\n\nText ohne Link\n")).toBeNull();
	});

	it("returns null when the only link is inside a ``` fence", () => {
		expect(plan("Text\n\n```\n[[a.docx]]\n```\n\nEnde\n")).toBeNull();
	});

	it("returns null when the only link is inside a ~~~ fence", () => {
		expect(plan("Text\n\n~~~\n[[a.docx]]\n~~~\n\nEnde\n")).toBeNull();
	});

	it("returns null when the only link is inside an unclosed fence (runs to EOF)", () => {
		expect(plan("Text\n\n```\n[[a.docx]]\nnoch mehr\n")).toBeNull();
	});

	it("returns null when the only link is inside a single-backtick inline code span", () => {
		expect(plan("Schreibe `[[a.docx]]` in die Notiz\n")).toBeNull();
	});

	it("returns null when the only link is inside a double-backtick inline code span", () => {
		expect(plan("Schreibe ``[[a.docx]]`` in die Notiz\n")).toBeNull();
	});

	describe("positive control: a normal body link after the skipped region is the anchor", () => {
		const cases: Array<[string, string, number]> = [
			["frontmatter", `---\nattachment: [[a.docx]]\n---\n\n${BODY}\n`, 4],
			["``` fence", `\`\`\`\n[[a.docx]]\n\`\`\`\n${BODY}\n`, 3],
			["~~~ fence", `~~~\n[[a.docx]]\n~~~\n${BODY}\n`, 3],
			["unclosed fence is not a control; body link before it", `${BODY}\n\`\`\`\n[[a.docx]]\n`, 0],
			["single-backtick span", `\`[[a.docx]]\`\n${BODY}\n`, 1],
			["double-backtick span", `\`\`[[a.docx]]\`\`\n${BODY}\n`, 1],
		];
		for (const [label, content, lineIndex] of cases) {
			it(`anchors at the body line (${label})`, () => {
				const result = plan(content);
				expect(result).not.toBeNull();
				expect(result?.lineIndex).toBe(lineIndex);
				expect(result?.text).toBe("![[a.docx.png]]");
				expect(result?.newContent).toContain(`${BODY}\n![[a.docx.png]]\n`);
			});
		}
	});
});
