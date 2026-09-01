import { describe, it, expect } from "vitest";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";

describe("parseIntakeGroups skips a blank line between two groups (SDD vorgang-next-steps p2 c12)", () => {
	it("assigns the blank line to no group's items", () => {
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
			"",
			"- Aus [[Besprechung Acme Folgetermin]]",
			"    - Rückmeldung geben",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const groups = parseIntakeGroups(content);

		expect(groups).toHaveLength(2);
		expect(groups[0].ownItems).toEqual([{ text: "Angebot einholen", children: [] }]);
		expect(groups[1].ownItems).toEqual([{ text: "Rückmeldung geben", children: [] }]);
		for (const group of groups) {
			for (const item of [...group.ownItems, ...group.foreignItems]) {
				expect(item.text.trim()).not.toBe("");
				expect(item.children).not.toContain("");
			}
		}
	});
});
