// intake-engine.ts does not exist yet. This import is expected to fail to
// resolve until the implementer creates the module — that unresolved-module
// failure IS the correct RED state for this criterion.
import { describe, it, expect } from "vitest";
import { buildIntakeGroup, insertIntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("buildIntakeGroup splits a foreign assignee-prefixed item into Warte auf (SDD vorgang-next-steps p2 c7)", () => {
	it("keeps the unprefixed item own and moves the mismatched-name item under Warte auf at eight-space indent", () => {
		const itemLines = ["Angebot einholen", "Max: Rückmeldung"];
		const source = "Besprechung Acme Kickoff";
		const ownNames = ["Erika"];

		const group = buildIntakeGroup(itemLines, source, ownNames);

		expect(group.ownItems).toEqual([{ text: "Angebot einholen", children: [] }]);
		expect(group.foreignItems).toEqual([{ text: "Max: Rückmeldung", children: [] }]);
		expect(group.due).toBeNull();
		expect(group.lineIndex).toBe(-1);

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
			"    - Warte auf:",
			"        - Max: Rückmeldung",
		].join("\n");

		expect(result.includes(expectedBlock)).toBe(true);
	});
});
