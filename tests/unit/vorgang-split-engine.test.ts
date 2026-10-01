import { describe, it, expect } from "vitest";
import { listSplitParts, splitVorgangContent } from "../../src/features/vorgang/vorgang-engine";

const DATE = new Date(2026, 9, 1);

const SOURCE = [
	"---",
	"tags:",
	"  - Vorgang",
	"---",
	"",
	"# Fakten und Pointer",
	"- Ansprechpartner: Max Mustermann",
	"    - Telefon über Zentrale",
	"- Vertragsnummer 4711",
	"",
	"# Nächste Schritte",
	"",
	"# Inhalt",
	"- [[#Angebot, 15.09.2026]]",
	"- [[#Besprechung Kickoff, 10.09.2026]]",
	"- [[#Notiz, 01.09.2026]]",
	"",
	"##### Angebot, 15.09.2026",
	"- Angebot von Acme liegt vor",
	"",
	"##### [[Besprechung Kickoff]], 10.09.2026",
	"- Zusammenfassung",
	"",
	"##### Notiz, 01.09.2026",
	"- Erste Notiz",
	"",
].join("\n");

const TARGET = [
	"---",
	"tags:",
	"  - Vorgang",
	"---",
	"",
	"# Fakten und Pointer",
	"- Bestehender Fakt",
	"",
	"# Inhalt",
	"- [[#Termin, 20.09.2026]]",
	"",
	"##### Termin, 20.09.2026",
	"- Termin vereinbart",
	"",
].join("\n");

function indexOf(content: string, line: string): number {
	return content.split("\n").indexOf(line);
}

describe("listSplitParts", () => {
	it("lists top-level facts with their indented children and every h5 section", () => {
		const parts = listSplitParts(SOURCE, "de");

		expect(parts.facts).toEqual([
			{ lineIndex: 6, lines: ["- Ansprechpartner: Max Mustermann", "    - Telefon über Zentrale"] },
			{ lineIndex: 8, lines: ["- Vertragsnummer 4711"] },
		]);
		expect(parts.sections.map((s) => s.headingText)).toEqual([
			"Angebot, 15.09.2026",
			"[[Besprechung Kickoff]], 10.09.2026",
			"Notiz, 01.09.2026",
		]);
	});

	it("accepts the legacy facts heading and returns no facts without one", () => {
		expect(listSplitParts("# Fakten\n- Alt", "de").facts).toEqual([{ lineIndex: 1, lines: ["- Alt"] }]);
		expect(listSplitParts("# Inhalt\n", "de").facts).toEqual([]);
	});
});

describe("splitVorgangContent", () => {
	it("moves a fact with its child and a section with its TOC bullet", () => {
		const result = splitVorgangContent(
			SOURCE,
			TARGET,
			{ facts: [6], sections: [indexOf(SOURCE, "##### Angebot, 15.09.2026")] },
			"Vorgang Ziel",
			"de",
			DATE,
		);

		expect(result.movedFacts).toBe(1);
		expect(result.movedSections).toBe(1);
		expect(result.newTargetContent).toBe(
			[
				"---",
				"tags:",
				"  - Vorgang",
				"---",
				"",
				"# Fakten und Pointer",
				"- Bestehender Fakt",
				"- Ansprechpartner: Max Mustermann",
				"    - Telefon über Zentrale",
				"",
				"# Inhalt",
				"- [[#Termin, 20.09.2026]]",
				"- [[#Angebot, 15.09.2026]]",
				"",
				"##### Termin, 20.09.2026",
				"- Termin vereinbart",
				"",
				"##### Angebot, 15.09.2026",
				"- Angebot von Acme liegt vor",
				"",
			].join("\n"),
		);
		expect(result.newSourceContent).toBe(
			[
				"---",
				"tags:",
				"  - Vorgang",
				"---",
				"",
				"# Fakten und Pointer",
				"- Vertragsnummer 4711",
				"- Teile verschoben nach [[Vorgang Ziel]] (01.10.2026)",
				"",
				"# Nächste Schritte",
				"",
				"# Inhalt",
				"- [[#Besprechung Kickoff, 10.09.2026]]",
				"- [[#Notiz, 01.09.2026]]",
				"",
				"##### [[Besprechung Kickoff]], 10.09.2026",
				"- Zusammenfassung",
				"",
				"##### Notiz, 01.09.2026",
				"- Erste Notiz",
				"",
			].join("\n"),
		);
	});

	it("removes the TOC bullet of a linked section", () => {
		const line = indexOf(SOURCE, "##### [[Besprechung Kickoff]], 10.09.2026");
		const result = splitVorgangContent(SOURCE, TARGET, { facts: [], sections: [line] }, "Vorgang Ziel", "de", DATE);

		expect(result.movedSections).toBe(1);
		expect(result.newSourceContent).not.toContain("Besprechung Kickoff");
		expect(result.newTargetContent).toContain("##### [[Besprechung Kickoff]], 10.09.2026\n- Zusammenfassung");
		expect(result.newTargetContent).toContain("- [[#Besprechung Kickoff, 10.09.2026]]");
	});

	it("skips a linked section the target already links and leaves it in the source", () => {
		const target = TARGET.replace("- [[#Termin, 20.09.2026]]", "- [[#Termin, 20.09.2026]]\n- [[#Besprechung Kickoff, 10.09.2026]]");
		const line = indexOf(SOURCE, "##### [[Besprechung Kickoff]], 10.09.2026");
		const result = splitVorgangContent(SOURCE, target, { facts: [], sections: [line] }, "Vorgang Ziel", "de", DATE);

		expect(result).toEqual({
			newSourceContent: SOURCE,
			newTargetContent: target,
			movedFacts: 0,
			movedSections: 0,
			skippedDuplicates: 1,
		});
	});

	it("sorts a dateless section by the split date", () => {
		const source = ["# Fakten und Pointer", "", "# Inhalt", "- [[#Ohne Datum]]", "", "##### Ohne Datum", "- Text", ""].join("\n");
		const result = splitVorgangContent(source, TARGET, { facts: [], sections: [5] }, "Vorgang Ziel", "de", DATE);

		expect(result.newTargetContent).toContain("# Inhalt\n- [[#Ohne Datum, 01.10.2026]]\n- [[#Termin, 20.09.2026]]");
		expect(result.newSourceContent).toBe(
			["# Fakten und Pointer", "- Teile verschoben nach [[Vorgang Ziel]] (01.10.2026)", "", "# Inhalt", ""].join("\n"),
		);
	});

	it("creates the facts section in a target that has none", () => {
		const target = ["---", "tags:", "  - Vorgang", "---", "", "# Inhalt", ""].join("\n");
		const result = splitVorgangContent(SOURCE, target, { facts: [8], sections: [] }, "Vorgang Ziel", "de", DATE);

		expect(result.newTargetContent).toBe(
			["---", "tags:", "  - Vorgang", "---", "# Fakten und Pointer", "- Vertragsnummer 4711", "", "# Inhalt", ""].join("\n"),
		);
	});

	it("changes nothing for an empty selection", () => {
		const result = splitVorgangContent(SOURCE, TARGET, { facts: [], sections: [] }, "Vorgang Ziel", "de", DATE);

		expect(result.newSourceContent).toBe(SOURCE);
		expect(result.newTargetContent).toBe(TARGET);
	});
});
