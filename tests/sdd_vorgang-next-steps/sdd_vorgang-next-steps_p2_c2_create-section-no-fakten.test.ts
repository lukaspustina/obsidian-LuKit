import { describe, it, expect } from "vitest";
import { insertIntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup creates '# Nächste Schritte' directly after frontmatter when Fakten is absent (SDD vorgang-next-steps p2 c2)", () => {
	it("places the section before any other content when the note has no '# Fakten und Pointer'", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Inhalt",
			"- [[#Alt, 01.01.2026]]",
			"",
		].join("\n");

		const group: IntakeGroup = {
			line: "- Aus [[Besprechung Acme Kickoff]]",
			source: "Besprechung Acme Kickoff",
			due: null,
			ownItems: [{ text: "Angebot einholen", children: [] }],
			foreignItems: [],
			lineIndex: -1,
		};

		const result = insertIntakeGroup(content, group);
		const lines = result.split("\n");

		const frontmatterEndIndex = lines.indexOf("---", 1);
		const indexNextSteps = lines.indexOf("# Nächste Schritte");
		const indexBoundary = lines.indexOf("#### Unsortiert");
		const indexGroupLine = lines.indexOf("- Aus [[Besprechung Acme Kickoff]]");
		const indexInhalt = lines.indexOf("# Inhalt");

		expect(frontmatterEndIndex).toBeGreaterThanOrEqual(0);
		expect(indexNextSteps).toBeGreaterThan(frontmatterEndIndex);
		expect(indexNextSteps).toBeLessThan(indexInhalt);
		expect(indexBoundary).toBeGreaterThan(indexNextSteps);
		expect(indexGroupLine).toBeGreaterThan(indexBoundary);

		// Nothing but blank lines sits between the frontmatter and the new section.
		for (let i = frontmatterEndIndex + 1; i < indexNextSteps; i++) {
			expect(lines[i]).toBe("");
		}
	});
});
