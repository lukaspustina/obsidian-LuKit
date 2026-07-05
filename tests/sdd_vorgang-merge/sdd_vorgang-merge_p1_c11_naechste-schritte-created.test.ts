import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent creates a Nächste Schritte section without mixing facts (SDD vorgang-merge p1 c11)", () => {
	it("adds a new # Nächste Schritte section with exactly the source bullets, between Fakten und Pointer and Inhalt", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- A",
			"",
			"# Nächste Schritte",
			"- B",
			"- C",
			"",
			"# Inhalt",
			"",
		].join("\n");

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
			"##### Alt, 30.06.2026",
			"- Alt-Body",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);
		const lines = result.newTargetContent.split("\n");

		const faktenIndex = lines.indexOf("# Fakten und Pointer");
		const naechsteIndex = lines.indexOf("# Nächste Schritte");
		const inhaltIndex = lines.indexOf("# Inhalt");

		expect(faktenIndex).toBeGreaterThan(-1);
		expect(naechsteIndex).toBeGreaterThan(-1);
		expect(inhaltIndex).toBeGreaterThan(-1);

		// Ordering: Fakten und Pointer -> Nächste Schritte -> Inhalt
		expect(faktenIndex).toBeLessThan(naechsteIndex);
		expect(naechsteIndex).toBeLessThan(inhaltIndex);

		// Fakten und Pointer section contains only the target's original bullet
		// plus the source's fact bullet — no Nächste-Schritte bullets mixed in.
		const faktenBullets: string[] = [];
		for (let i = faktenIndex + 1; i < naechsteIndex; i++) {
			const line = lines[i].trim();
			if (line.length > 0) faktenBullets.push(line);
		}
		expect(faktenBullets).toEqual(["- X", "- A"]);

		// Nächste Schritte section contains exactly the source's next-step
		// bullets, in source order, with no facts mixed in.
		const naechsteBullets: string[] = [];
		for (let i = naechsteIndex + 1; i < inhaltIndex; i++) {
			const line = lines[i].trim();
			if (line.length > 0) naechsteBullets.push(line);
		}
		expect(naechsteBullets).toEqual(["- B", "- C"]);
	});
});
