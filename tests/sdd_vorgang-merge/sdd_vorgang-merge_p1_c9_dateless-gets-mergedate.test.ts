import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent dates a dateless source h5 section with mergeDate (SDD vorgang-merge p1 c9)", () => {
	it("sorts a dateless section as if dated mergeDate, TOC gets mergeDate, header text stays unchanged", () => {
		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 6, 5);

		const targetContent = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"- Fakt X",
			"",
			"# Inhalt",
			"",
			"- [[#Neu, 10.07.2026]]",
			"- [[#Alt, 30.06.2026]]",
			"",
			"##### Neu, 10.07.2026",
			"- Neuer Body",
			"",
			"##### Alt, 30.06.2026",
			"- Alter Body",
			"",
		].join("\n");

		const sourceContent = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
			"##### Planungsnotiz",
			"- Planungsbody",
			"",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.mergedSections).toBe(1);

		const lines = result.newTargetContent.split("\n");

		const headerNeu = lines.indexOf("##### Neu, 10.07.2026");
		const headerPlanung = lines.indexOf("##### Planungsnotiz");
		const headerAlt = lines.indexOf("##### Alt, 30.06.2026");
		expect(headerNeu).toBeGreaterThan(-1);
		expect(headerPlanung).toBeGreaterThan(-1);
		expect(headerAlt).toBeGreaterThan(-1);
		expect(headerNeu).toBeLessThan(headerPlanung);
		expect(headerPlanung).toBeLessThan(headerAlt);

		const tocPlanung = lines.indexOf("- [[#Planungsnotiz, 05.07.2026]]");
		expect(tocPlanung).toBeGreaterThan(-1);
		const tocNeu = lines.indexOf("- [[#Neu, 10.07.2026]]");
		const tocAlt = lines.indexOf("- [[#Alt, 30.06.2026]]");
		expect(tocNeu).toBeLessThan(tocPlanung);
		expect(tocPlanung).toBeLessThan(tocAlt);

		expect(result.newTargetContent).toContain("- Planungsbody");
	});
});
