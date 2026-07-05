import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

const locale: DateLocale = "de";
const mergeDate = new Date(2026, 6, 5);

const targetContent = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"- X",
	"",
	"# Inhalt",
	"",
].join("\n");

describe("mergeVorgangContent leaves target Fakten section unchanged for empty/missing source Fakten (SDD vorgang-merge p1 c4)", () => {
	it("leaves the target Fakten section textually unchanged when the source Fakten section is empty (header only)", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.newTargetContent).toBe(targetContent);
		expect(result.mergedSections).toBe(0);
		expect(result.skippedDuplicates).toBe(0);
	});

	it("leaves the target Fakten section textually unchanged when the source has no Fakten section at all", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.newTargetContent).toBe(targetContent);
		expect(result.mergedSections).toBe(0);
		expect(result.skippedDuplicates).toBe(0);
	});
});
