import { describe, it, expect } from "vitest";
import { mergeVorgangContent } from "../../src/features/vorgang/vorgang-engine";
import type { DateLocale } from "../../src/shared/date-format";

describe("mergeVorgangContent tolerates lowercase '# nächste Schritte' header (SDD vorgang-next-steps p1 c1)", () => {
	it("carries both bullets of a lowercase-spelled source section into the target's '# Nächste Schritte'", () => {
		const sourceContent = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"",
			"# nächste Schritte",
			"- Angebot einholen",
			"- Rückmeldung geben",
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
			"",
			"# Nächste Schritte",
			"",
			"# Inhalt",
			"",
		].join("\n");

		const locale: DateLocale = "de";
		const mergeDate = new Date(2026, 8, 1);

		const result = mergeVorgangContent(sourceContent, targetContent, locale, mergeDate);

		const lines = result.newTargetContent.split("\n");
		const headerIndex = lines.indexOf("# Nächste Schritte");
		const indexAngebot = lines.indexOf("- Angebot einholen");
		const indexRueckmeldung = lines.indexOf("- Rückmeldung geben");

		expect(headerIndex).toBeGreaterThanOrEqual(0);
		expect(indexAngebot).toBeGreaterThan(headerIndex);
		expect(indexRueckmeldung).toBeGreaterThan(headerIndex);
	});
});
