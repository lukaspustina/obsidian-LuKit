import { describe, it, expect } from "vitest";
import { planAutoEmbed } from "../../src/features/office-previews/office-previews-engine";

const src = (name: string) => (p: string): boolean => p === name;
const img = (name: string) => (p: string): boolean => p === name;
const isPreview = (p: string): boolean => /\.(docx|xlsx|pptx)\.(png|jpg)$/.test(p);

const LINE = "Anhänge: ![[a.docx]], ![[b.xlsx]]";

describe("SDD office-previews-auto-embed p1 c1", () => {
	it("plans the embed for b.xlsx below the multi-document line at lineIndex 0", () => {
		const plan = planAutoEmbed(LINE, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]");
		expect(plan).not.toBeNull();
		expect(plan?.lineIndex).toBe(0);
		expect(plan?.text).toBe("![[b.xlsx.png]]");
	});

	it("keeps line 0 byte-identical in newContent", () => {
		const plan = planAutoEmbed(LINE, src("b.xlsx"), img("b.xlsx.png"), isPreview, "![[b.xlsx.png]]");
		expect(plan?.newContent.split("\n")[0]).toBe(LINE);
		expect(plan?.newContent).toBe(`${LINE}\n![[b.xlsx.png]]`);
	});
});
