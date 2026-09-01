import { describe, it, expect } from "vitest";
import {
	buildIntakeGroup,
	insertIntakeGroup,
	parseIntakeGroups,
} from "../../src/features/vorgang/intake-engine";

describe("insertIntakeGroup writes a non-empty group exactly once (SDD vorgang-next-steps p2 c11)", () => {
	it("the ⌘K write path yields one group holding the typed items, not a second write", () => {
		const baseContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = buildIntakeGroup(
			["Angebot einholen", "Rückmeldung geben"],
			"Besprechung Acme Kickoff",
			[]
		);
		const result = insertIntakeGroup(baseContent, group);

		const occurrences = result.split("- Aus [[Besprechung Acme Kickoff]]").length - 1;
		expect(occurrences).toBe(1);

		const groups = parseIntakeGroups(result);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((item) => item.text)).toEqual([
			"Angebot einholen",
			"Rückmeldung geben",
		]);
	});
});
