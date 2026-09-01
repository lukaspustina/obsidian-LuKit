import { describe, it, expect } from "vitest";
import { parseIntakeGroups, takeOverGroup, insertIntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("a group with an empty Warte-auf sub-bullet parses to foreignItems: [] and is never re-emitted (SDD vorgang-next-steps p2 c13)", () => {
	it("parses foreignItems as [] and omits the Warte-auf line on take-over and on a fresh insertion", () => {
		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"    - Warte auf:",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const groups = parseIntakeGroups(content);
		expect(groups).toHaveLength(1);
		expect(groups[0].foreignItems).toEqual([]);

		const takenOver = takeOverGroup(content, groups[0]);
		if (takenOver === null) throw new Error("expected takeOverGroup to find the group");
		expect(takenOver.newContent).not.toContain("Warte auf:");

		const freshNote = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"",
			"# Inhalt",
			"",
		].join("\n");
		const freshInsert = insertIntakeGroup(freshNote, groups[0]);
		expect(freshInsert).not.toContain("Warte auf:");
	});
});
