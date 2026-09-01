import { describe, it, expect } from "vitest";
import { parseIntakeGroups, takeOverGroup } from "../../src/features/vorgang/intake-engine";

describe("take-over removes the group's former line range (SDD vorgang-next-steps p2 c18)", () => {
	it("moves own and foreign items above the boundary and leaves no trace of the original lines", () => {
		const parentLine = "- Aus [[Besprechung Acme Kickoff]]";
		const ownItemLine = "    - Angebot einholen";
		const warteAufLine = "    - Warte auf:";
		const foreignItemLine = "        - Max: Rückmeldung einholen";

		const content = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Nächste Schritte",
			"- Bestehender Punkt",
			"",
			"#### Unsortiert",
			parentLine,
			ownItemLine,
			warteAufLine,
			foreignItemLine,
			"",
			"# Inhalt",
			"",
		].join("\n");

		const group = parseIntakeGroups(content)[0];
		expect(group.ownItems).toHaveLength(1);
		expect(group.foreignItems).toHaveLength(1);

		const result = takeOverGroup(content, group);
		expect(result).not.toBeNull();
		const newContent = result!.newContent;

		// The group's exact former line range no longer appears anywhere in the note.
		expect(newContent).not.toContain(parentLine);
		expect(newContent).not.toContain(ownItemLine);
		expect(newContent).not.toContain(warteAufLine);
		expect(newContent).not.toContain(foreignItemLine);

		// The separator is gone entirely, not merely re-indented.
		expect(newContent).not.toContain("Warte auf:");

		// Both items now live above the boundary as top-level bullets appended to the
		// curated part, in own-then-foreign order.
		const boundaryIndex = newContent.indexOf("#### Unsortiert");
		const curatedIndex = newContent.indexOf("- Bestehender Punkt");
		const ownIndex = newContent.indexOf("- Angebot einholen");
		const foreignIndex = newContent.indexOf("- Max: Rückmeldung einholen");

		expect(boundaryIndex).toBeGreaterThan(0);
		expect(curatedIndex).toBeGreaterThanOrEqual(0);
		expect(ownIndex).toBeGreaterThan(curatedIndex);
		expect(foreignIndex).toBeGreaterThan(ownIndex);
		expect(foreignIndex).toBeLessThan(boundaryIndex);
	});
});
