import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";

describe("mergeVorgangContent does not dedup wikilink-free headers (SDD vorgang-merge p1 c8)", () => {
	it("inserts a plain-header source section even when the target TOC has a same-named entry", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
			"##### Telefonat, 01.07.2026",
			"- Quell-Notiz",
			"",
		].join("\n");

		const targetContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
			"- [[#Telefonat, 15.06.2026]]",
			"",
			"##### Telefonat, 15.06.2026",
			"- Alte Notiz",
			"",
		].join("\n");

		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, "de", mergeDate);

		expect(result.mergedSections).toBe(1);
		expect(result.skippedDuplicates).toBe(0);
		expect(result.newTargetContent).toContain("##### Telefonat, 01.07.2026");
		expect(result.newTargetContent).toContain("##### Telefonat, 15.06.2026");
	});
});
