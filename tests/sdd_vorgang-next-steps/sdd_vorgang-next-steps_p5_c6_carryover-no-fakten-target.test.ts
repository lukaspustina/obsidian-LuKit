// The independent review pass found the merge carryover using mergeH1Section's
// create branch, which inserts at frontmatterEnd + 1 when the target has no
// facts heading — exactly the placement insertIntakeGroup was fixed to avoid.
// The target's own body then falls inside the intake region and a later ⌘X
// deletes it.
import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";

describe("merge carryover into a target without '# Fakten und Pointer' (SDD vorgang-next-steps p5 c6)", () => {
	it("keeps the target's own body out of the intake region", () => {
		const source = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Nächste Schritte",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Punkt A",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const target = [
			"---",
			"tags: [Person]",
			"---",
			"",
			"Erika Beispiel, Ansprechpartnerin bei Acme.",
			"- Telefon 0123",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const merged = mergeVorgangContent(source, target, "de", new Date(2026, 8, 2)).newTargetContent;

		expect(parseIntakeGroups(merged)).toHaveLength(1);
		expect(merged).toContain("Erika Beispiel, Ansprechpartnerin bei Acme.");
		expect(merged).toContain("- Telefon 0123");
	});
});
