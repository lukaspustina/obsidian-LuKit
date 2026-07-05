import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent creates # Fakten und Pointer after frontmatter when missing in target (SDD vorgang-merge p1 c2)", () => {
	it("inserts the section directly after the frontmatter and before # Inhalt, carrying over the source bullet", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"# Fakten und Pointer",
			"- Ein Fakt",
		].join("\n");

		const targetContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"# Inhalt",
			"",
			"- [[#Alt, 30.06.2026]]",
			"",
			"##### Alt, 30.06.2026",
			"- Alter Eintrag",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);
		const newLines = result.newTargetContent.split("\n");

		const frontmatterEndIndex = newLines.indexOf("---", 1);
		const faktenIndex = newLines.indexOf("# Fakten und Pointer");
		const inhaltIndex = newLines.indexOf("# Inhalt");

		expect(frontmatterEndIndex).toBeGreaterThan(-1);
		expect(faktenIndex).toBeGreaterThan(-1);
		expect(inhaltIndex).toBeGreaterThan(-1);
		expect(faktenIndex).toBeGreaterThan(frontmatterEndIndex);
		expect(faktenIndex).toBeLessThan(inhaltIndex);
		expect(newLines).toContain("- Ein Fakt");

		const faktenBulletIndex = newLines.indexOf("- Ein Fakt");
		expect(faktenBulletIndex).toBeGreaterThan(faktenIndex);
		expect(faktenBulletIndex).toBeLessThan(inhaltIndex);
	});
});
