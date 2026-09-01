// intake-engine.ts does not exist yet. This import is expected to fail to
// resolve until the implementer creates the module — that unresolved-module
// failure IS the correct RED state for this criterion.
import { describe, it, expect } from "vitest";
import { buildIntakeGroup, insertIntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("buildIntakeGroup writes no Warte auf sub-bullet when every item is own (SDD vorgang-next-steps p2 c8)", () => {
	it("classifies the assignee-prefixed item as own when its name is in ownNames", () => {
		const itemLines = ["Angebot einholen", "Max: Rückmeldung"];
		const source = "Besprechung Acme Kickoff";
		const ownNames = ["Max"];

		const group = buildIntakeGroup(itemLines, source, ownNames);

		expect(group.ownItems).toEqual([
			{ text: "Angebot einholen", children: [] },
			{ text: "Max: Rückmeldung", children: [] },
		]);
		expect(group.foreignItems).toEqual([]);

		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"#### Unsortiert",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const result = insertIntakeGroup(content, group);

		const expectedBlock = [
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"    - Max: Rückmeldung",
		].join("\n");

		expect(result.includes(expectedBlock)).toBe(true);
		expect(result.includes("Warte auf")).toBe(false);
	});
});
