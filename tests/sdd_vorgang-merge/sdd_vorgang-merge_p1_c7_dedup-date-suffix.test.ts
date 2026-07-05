import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent dedups against the date-suffix TOC variant (SDD vorgang-merge p1 c7)", () => {
	it("skips a source section whose header link matches a date-suffixed anchor bullet in the target TOC", () => {
		const locale: DateLocale = "de";

		const targetContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"# Fakten und Pointer",
			"- Bestehender Fakt",
			"",
			"# Inhalt",
			"- [[#Besprechung - Acme, 30.06.2026]]",
			"",
			"##### Besprechung - Acme, 30.06.2026",
			"- Alter Inhalt",
		].join("\n");

		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
			"##### [[Besprechung - Acme]], 01.07.2026",
			"- Notizen zum Anruf",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, new Date(2026, 6, 5));

		expect(result.mergedSections).toBe(0);
		expect(result.skippedDuplicates).toBe(1);
		expect(result.newTargetContent).toBe(targetContent);
		expect(result.newTargetContent).not.toContain("01.07.2026");
		expect(result.newTargetContent).not.toContain("Notizen zum Anruf");
	});
});
