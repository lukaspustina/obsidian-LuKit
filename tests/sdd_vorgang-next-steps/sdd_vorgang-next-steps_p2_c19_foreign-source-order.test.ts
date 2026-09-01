// intake-engine.ts does not exist yet. This import is expected to fail to
// resolve until the implementer creates the module — that unresolved-module
// failure IS the correct RED state for this criterion.
import { describe, it, expect } from "vitest";
import { buildIntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("buildIntakeGroup orders foreign items in source order, not by assignee name (SDD vorgang-next-steps p2 c19)", () => {
	it("keeps two foreign items from different assignees in their original relative order, own item unaffected", () => {
		const itemLines = ["Petra: Rückmeldung geben", "Angebot einholen", "Hans: Vertrag prüfen"];
		const source = "Besprechung Acme Kickoff";
		const ownNames = ["Erika"];

		const group = buildIntakeGroup(itemLines, source, ownNames);

		expect(group.ownItems).toEqual([{ text: "Angebot einholen", children: [] }]);
		expect(group.foreignItems).toEqual([
			{ text: "Petra: Rückmeldung geben", children: [] },
			{ text: "Hans: Vertrag prüfen", children: [] },
		]);
	});
});
