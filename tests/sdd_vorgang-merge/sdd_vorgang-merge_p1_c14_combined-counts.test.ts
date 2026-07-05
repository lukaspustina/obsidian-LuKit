import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent combined dedup + merge counts (SDD vorgang-merge p1 c14)", () => {
	it("reports mergedSections === 2 and skippedDuplicates === 1 for one call mixing both cases", () => {
		const locale: DateLocale = "de";

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
			"- Erster neuer Punkt",
			"",
			"##### [[Besprechung - Acme]], 30.06.2026",
			"- Bereits im Ziel verlinkt",
			"",
			"##### Vertrag, 02.07.2026",
			"- Zweiter neuer Punkt",
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
			"- [[#Besprechung - Acme, 30.06.2026]]",
			"",
			"##### [[Besprechung - Acme]], 30.06.2026",
			"- Bestehender Inhalt",
			"",
		].join("\n");

		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.mergedSections).toBe(2);
		expect(result.skippedDuplicates).toBe(1);

		expect(result.newTargetContent).toContain("##### Telefonat, 01.07.2026");
		expect(result.newTargetContent).toContain("##### Vertrag, 02.07.2026");

		const dupOccurrences = result.newTargetContent.split("##### [[Besprechung - Acme]], 30.06.2026").length - 1;
		expect(dupOccurrences).toBe(1);
	});
});
