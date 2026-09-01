// intake-engine.ts does not exist yet. This import is expected to fail to
// resolve until the implementer creates the module — that unresolved-module
// failure IS the correct RED state for this criterion.
import { describe, it, expect } from "vitest";
import { buildIntakeGroup } from "../../src/features/vorgang/intake-engine";

describe("buildIntakeGroup preserves an item's further-indented lines verbatim (SDD vorgang-next-steps p2 c9)", () => {
	it("keeps both continuation lines with their relative indent following the item", () => {
		const itemLines = ["Angebot senden", "    - Anhang enthalten", "        - Frist beachten"];
		const source = "Besprechung Acme Kickoff";
		const ownNames: string[] = [];

		const group = buildIntakeGroup(itemLines, source, ownNames);

		expect(group.ownItems).toEqual([
			{
				text: "Angebot senden",
				children: ["    - Anhang enthalten", "        - Frist beachten"],
			},
		]);
		expect(group.foreignItems).toEqual([]);
	});
});
