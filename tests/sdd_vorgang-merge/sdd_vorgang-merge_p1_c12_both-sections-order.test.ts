import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent creates both Fakten and Nächste Schritte in order when both missing in target (SDD vorgang-merge p1 c12)", () => {
	it("inserts # Fakten und Pointer then # Nächste Schritte, both before # Inhalt, with the source bullets", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"# Fakten und Pointer",
			"- Ein Fakt",
			"# Nächste Schritte",
			"- Ein Schritt",
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
		const naechsteIndex = newLines.indexOf("# Nächste Schritte");
		const inhaltIndex = newLines.indexOf("# Inhalt");

		expect(frontmatterEndIndex).toBeGreaterThan(-1);
		expect(faktenIndex).toBeGreaterThan(-1);
		expect(naechsteIndex).toBeGreaterThan(-1);
		expect(inhaltIndex).toBeGreaterThan(-1);

		// Order: frontmatter -> Fakten -> Nächste Schritte -> Inhalt
		expect(faktenIndex).toBeGreaterThan(frontmatterEndIndex);
		expect(naechsteIndex).toBeGreaterThan(faktenIndex);
		expect(inhaltIndex).toBeGreaterThan(naechsteIndex);

		const faktenBulletIndex = newLines.indexOf("- Ein Fakt");
		const schrittBulletIndex = newLines.indexOf("- Ein Schritt");

		expect(faktenBulletIndex).toBeGreaterThan(faktenIndex);
		expect(faktenBulletIndex).toBeLessThan(naechsteIndex);

		expect(schrittBulletIndex).toBeGreaterThan(naechsteIndex);
		expect(schrittBulletIndex).toBeLessThan(inhaltIndex);
	});
});
