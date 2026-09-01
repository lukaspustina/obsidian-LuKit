import { describe, it, expect } from "vitest";
import { insertIntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup creates '# Nächste Schritte' after '# Fakten und Pointer' (SDD vorgang-next-steps p2 c1)", () => {
	it("inserts the section, boundary and group below an existing Fakten section", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Bestehender Fakt",
			"",
			"# Inhalt",
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

		const indexFakten = lines.indexOf("# Fakten und Pointer");
		const indexFakt = lines.indexOf("- Bestehender Fakt");
		const indexNextSteps = lines.indexOf("# Nächste Schritte");
		const indexBoundary = lines.indexOf("#### Unsortiert");
		const indexGroupLine = lines.indexOf("- Aus [[Besprechung Acme Kickoff]]");
		const indexInhalt = lines.indexOf("# Inhalt");

		expect(indexFakten).toBeGreaterThanOrEqual(0);
		expect(indexFakt).toBeGreaterThan(indexFakten);
		expect(indexNextSteps).toBeGreaterThan(indexFakt);
		expect(indexBoundary).toBeGreaterThan(indexNextSteps);
		expect(indexGroupLine).toBeGreaterThan(indexBoundary);
		expect(indexInhalt).toBeGreaterThan(indexGroupLine);

		// The pre-existing Fakten content stays untouched.
		expect(lines.includes("- Bestehender Fakt")).toBe(true);
	});
});
