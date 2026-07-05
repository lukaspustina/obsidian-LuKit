import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";

describe("mergeVorgangContent dedups a source section whose header link is already in the target Inhalt (SDD vorgang-merge p1 c6)", () => {
	it("skips the duplicate linked section, counts it as skippedDuplicates, and leaves the target unchanged", () => {
		const sourceLines = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"##### [[Besprechung - Acme]], 01.07.2026",
			"- Quell-Body",
		];
		const sourceContent = sourceLines.join("\n");

		const targetLines = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"- Ziel-Fakt",
			"",
			"# Inhalt",
			"- [[Besprechung - Acme]], 01.07.2026",
			"",
			"##### [[Besprechung - Acme]], 01.07.2026",
			"- Ziel-Body",
		];
		const targetContent = targetLines.join("\n");

		const mergeDate = new Date(2026, 6, 5);

		const result = mergeVorgangContent(sourceContent, targetContent, "de", mergeDate);

		expect(result.newTargetContent).toBe(targetContent);
		expect(result.mergedSections).toBe(0);
		expect(result.skippedDuplicates).toBe(1);
	});
});
