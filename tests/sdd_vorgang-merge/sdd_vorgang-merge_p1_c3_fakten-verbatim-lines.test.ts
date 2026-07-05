import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent copies source Fakten lines verbatim (SDD vorgang-merge p1 c3)", () => {
	it("carries a nested bullet and a prefix-free free-text line into the target Fakten section, byte-identical per line", () => {
		const locale: DateLocale = "de";

		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Quell-Bullet",
			"\t- Unterpunkt",
			"Freitext ohne Präfix",
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
			"- Ziel-Bullet",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const result = mergeVorgangContent(sourceContent, targetContent, locale, new Date(2026, 6, 5));

		const newLines = result.newTargetContent.split("\n");
		const faktenIndex = newLines.indexOf("# Fakten und Pointer");
		expect(faktenIndex).toBeGreaterThanOrEqual(0);

		const inhaltIndex = newLines.indexOf("# Inhalt");
		expect(inhaltIndex).toBeGreaterThan(faktenIndex);

		const faktenSectionLines = newLines
			.slice(faktenIndex + 1, inhaltIndex)
			.filter((l) => l.trim() !== "");

		// No data loss: every non-empty source Fakten line survives byte-identical,
		// including the nested bullet (tab-indented) and the prefix-free free-text line.
		expect(faktenSectionLines).toEqual([
			"- Ziel-Bullet",
			"- Quell-Bullet",
			"\t- Unterpunkt",
			"Freitext ohne Präfix",
		]);

		// No blank line was inserted between last old and first new line.
		const oldLastIndex = newLines.indexOf("- Ziel-Bullet");
		expect(newLines[oldLastIndex + 1]).toBe("- Quell-Bullet");
	});
});
