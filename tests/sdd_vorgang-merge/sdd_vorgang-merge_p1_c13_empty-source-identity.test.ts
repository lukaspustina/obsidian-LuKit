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
	"- [[#Bestand, 30.06.2026]]",
	"",
	"##### Bestand, 30.06.2026",
	"- Alter Eintrag",
	"",
].join("\n");

describe("mergeVorgangContent leaves target byte-identical for a source with no Fakten, no Nächste Schritte, and no h5-sections (SDD vorgang-merge p1 c13)", () => {
	it("returns newTargetContent === targetContent with zero merged and zero skipped counts", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"Nur Freitext ohne jede Sektion.",
			"Noch eine Zeile Freitext.",
			"",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		expect(result.newTargetContent).toBe(targetContent);
		expect(result.mergedSections).toBe(0);
		expect(result.skippedDuplicates).toBe(0);
	});
});
