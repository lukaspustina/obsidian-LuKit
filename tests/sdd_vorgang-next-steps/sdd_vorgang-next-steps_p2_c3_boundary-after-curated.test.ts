import { describe, it, expect } from "vitest";
import { insertIntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup adds the boundary after existing curated bullets (SDD vorgang-next-steps p2 c3)", () => {
	it("keeps both curated bullets byte-identical and places the boundary after them", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Fakt",
			"",
			"# Nächste Schritte",
			"- Erstes Bullet",
			"- Zweites Bullet",
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

		const indexErstes = lines.indexOf("- Erstes Bullet");
		const indexZweites = lines.indexOf("- Zweites Bullet");
		const indexBoundary = lines.indexOf("#### Unsortiert");
		const indexGroupLine = lines.indexOf("- Aus [[Besprechung Acme Kickoff]]");
		const indexInhalt = lines.indexOf("# Inhalt");

		// Exactly one "# Nächste Schritte" header — no duplicate section was created.
		expect(lines.filter((l) => l === "# Nächste Schritte").length).toBe(1);

		expect(indexErstes).toBeGreaterThanOrEqual(0);
		expect(indexZweites).toBeGreaterThan(indexErstes);
		expect(indexBoundary).toBeGreaterThan(indexZweites);
		expect(indexGroupLine).toBeGreaterThan(indexBoundary);
		expect(indexInhalt).toBeGreaterThan(indexGroupLine);

		// The two curated bullets survive byte-identical (exact strings, still present).
		expect(lines[indexErstes]).toBe("- Erstes Bullet");
		expect(lines[indexZweites]).toBe("- Zweites Bullet");
	});
});
