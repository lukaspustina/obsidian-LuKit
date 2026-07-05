import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent appends Fakten bullets in order (SDD vorgang-merge p1 c1)", () => {
	it("appends source bullets A, B after target bullet X without a blank line in between", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- A",
			"- B",
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
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		const lines = result.newTargetContent.split("\n");
		const indexX = lines.indexOf("- X");
		const indexA = lines.indexOf("- A");
		const indexB = lines.indexOf("- B");

		expect(indexX).toBeGreaterThanOrEqual(0);
		expect(indexA).toBeGreaterThan(indexX);
		expect(indexB).toBeGreaterThan(indexA);

		// No blank line inserted between "- X" and "- A".
		expect(lines[indexX + 1]).toBe("- A");
		expect(lines[indexA + 1]).toBe("- B");
	});
});
