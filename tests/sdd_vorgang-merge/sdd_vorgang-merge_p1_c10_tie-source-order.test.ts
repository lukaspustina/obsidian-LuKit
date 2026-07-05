import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent preserves source order for same-date sections (SDD vorgang-merge p1 c10)", () => {
	it("keeps Erstens before Zweitens in both h5 headers and TOC bullets when both share 01.07.2026", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Fakt",
			"",
			"# Inhalt",
			"- [[#Erstens, 01.07.2026]]",
			"- [[#Zweitens, 01.07.2026]]",
			"",
			"##### Erstens, 01.07.2026",
			"- Inhalt Erstens",
			"",
			"##### Zweitens, 01.07.2026",
			"- Inhalt Zweitens",
			"",
		].join("\n");

		const targetContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Ziel-Fakt",
			"",
			"# Inhalt",
			"- [[#Bestehend, 30.06.2026]]",
			"",
			"##### Bestehend, 30.06.2026",
			"- Alt",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.mergedSections).toBe(2);
		expect(result.skippedDuplicates).toBe(0);

		const headerOrder = [
			result.newTargetContent.indexOf("##### Erstens, 01.07.2026"),
			result.newTargetContent.indexOf("##### Zweitens, 01.07.2026"),
			result.newTargetContent.indexOf("##### Bestehend, 30.06.2026"),
		];
		expect(headerOrder.every((i) => i !== -1)).toBe(true);
		expect(headerOrder[0]).toBeLessThan(headerOrder[1]);
		expect(headerOrder[1]).toBeLessThan(headerOrder[2]);

		const bulletOrder = [
			result.newTargetContent.indexOf("[[#Erstens, 01.07.2026]]"),
			result.newTargetContent.indexOf("[[#Zweitens, 01.07.2026]]"),
			result.newTargetContent.indexOf("[[#Bestehend, 30.06.2026]]"),
		];
		expect(bulletOrder.every((i) => i !== -1)).toBe(true);
		expect(bulletOrder[0]).toBeLessThan(bulletOrder[1]);
		expect(bulletOrder[1]).toBeLessThan(bulletOrder[2]);
	});
});
