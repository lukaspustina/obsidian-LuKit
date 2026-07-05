import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent sorts source h5 sections into the target by date (SDD vorgang-merge p1 c5)", () => {
	it("inserts two new sections date-sorted around an existing target section, TOC and headers in matching order, mergedSections === 2", () => {
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
			"- [[#Alt, 30.06.2026]]",
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
			"##### Neu1, 01.07.2026",
			"- Body 1",
			"",
			"##### Neu2, 15.06.2026",
			"- Body 2",
			"",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.mergedSections).toBe(2);

		const lines = result.newTargetContent.split("\n");

		const headerNeu1 = lines.indexOf("##### Neu1, 01.07.2026");
		const headerAlt = lines.indexOf("##### Alt, 30.06.2026");
		const headerNeu2 = lines.indexOf("##### Neu2, 15.06.2026");
		expect(headerNeu1).toBeGreaterThan(-1);
		expect(headerAlt).toBeGreaterThan(-1);
		expect(headerNeu2).toBeGreaterThan(-1);
		expect(headerNeu1).toBeLessThan(headerAlt);
		expect(headerAlt).toBeLessThan(headerNeu2);

		const tocNeu1 = lines.indexOf("- [[#Neu1, 01.07.2026]]");
		const tocAlt = lines.indexOf("- [[#Alt, 30.06.2026]]");
		const tocNeu2 = lines.indexOf("- [[#Neu2, 15.06.2026]]");
		expect(tocNeu1).toBeGreaterThan(-1);
		expect(tocAlt).toBeGreaterThan(-1);
		expect(tocNeu2).toBeGreaterThan(-1);
		expect(tocNeu1).toBeLessThan(tocAlt);
		expect(tocAlt).toBeLessThan(tocNeu2);

		expect(result.newTargetContent).toContain("- Body 1");
		expect(result.newTargetContent).toContain("- Body 2");
		expect(lines.indexOf("- Body 1")).toBeGreaterThan(headerNeu1);
		expect(lines.indexOf("- Body 2")).toBeGreaterThan(headerNeu2);
	});
});
