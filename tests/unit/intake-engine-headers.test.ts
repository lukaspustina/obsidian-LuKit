import { describe, it, expect } from "vitest";
import { buildIntakeGroup, insertIntakeGroup, parseIntakeGroups, takeOverGroup } from "../../src/features/vorgang/intake-engine";

const OWN = ["Max"];

// Meeting notes (Granola & co.) express "who owns this" as a plain paragraph
// line ending in a colon, with the items as unindented bullets below it — the
// grouping is in the paragraph, not in the indentation.
const MEETING_LINES = [
	"Max:",
	"- Angebot prüfen",
	"- Termin mit Erika Beispiel vereinbaren",
	"Petra Schneider:",
	"- Zahlen liefern",
	"- Vertrag gegenzeichnen",
];

function noteWith(lines: string[]): string {
	return ["# Nächste Schritte", "", "#### Unsortiert", "", ...lines, ""].join("\n");
}

describe("buildIntakeGroup — plain header lines", () => {
	it("nests the bullets below a header under it instead of beside it", () => {
		const group = buildIntakeGroup(MEETING_LINES, "Besprechung - Kickoff", OWN);

		expect(group.ownItems.map((i) => i.text)).toEqual(["Max:"]);
		expect(group.ownItems[0].children).toEqual([
			"    - Angebot prüfen",
			"    - Termin mit Erika Beispiel vereinbaren",
		]);
	});

	it("reads the header as the assignee, so a foreign block lands behind Warte auf", () => {
		const group = buildIntakeGroup(MEETING_LINES, "Besprechung - Kickoff", OWN);

		expect(group.foreignItems.map((i) => i.text)).toEqual(["Petra Schneider:"]);
		expect(group.foreignItems[0].children).toEqual(["    - Zahlen liefern", "    - Vertrag gegenzeichnen"]);
	});

	it("keeps every header own when no own names are configured (detection off)", () => {
		const group = buildIntakeGroup(MEETING_LINES, "Besprechung - Kickoff", []);

		expect(group.ownItems.map((i) => i.text)).toEqual(["Max:", "Petra Schneider:"]);
		expect(group.foreignItems).toEqual([]);
	});

	it("nests an already-indented line one level deeper inside a header block", () => {
		const group = buildIntakeGroup(["Max:", "- Angebot prüfen", "    - Preise gegenlesen"], "Q", OWN);

		expect(group.ownItems[0].children).toEqual(["    - Angebot prüfen", "        - Preise gegenlesen"]);
	});

	it("leaves a bulleted colon line alone — there the indent already carries the grouping", () => {
		const group = buildIntakeGroup(["- Max:", "    - Angebot prüfen"], "Q", OWN);

		expect(group.ownItems.map((i) => i.text)).toEqual(["Max:"]);
		expect(group.ownItems[0].children).toEqual(["    - Angebot prüfen"]);
	});

	it("closes the block at the next header, not at the first bullet", () => {
		const group = buildIntakeGroup(["Max:", "- Eins", "- Zwei", "Max:", "- Drei"], "Q", OWN);

		expect(group.ownItems.map((i) => i.children.length)).toEqual([2, 1]);
	});
});

describe("header groups survive the note round trip", () => {
	it("writes the nesting and parses it back unchanged", () => {
		const group = buildIntakeGroup(MEETING_LINES, "Besprechung - Kickoff", OWN);
		const content = insertIntakeGroup(noteWith([]), group);

		expect(content).toContain("    - Max:\n        - Angebot prüfen");
		expect(content).toContain("    - Warte auf:\n        - Petra Schneider:\n            - Zahlen liefern");

		const [parsed] = parseIntakeGroups(content);
		expect(parsed.ownItems).toEqual(group.ownItems);
		expect(parsed.foreignItems).toEqual(group.foreignItems);
	});
});

describe("takeOverGroup — the picker's selection is what gets written", () => {
	it("writes the edited text, not the parsed one, and keeps the given children", () => {
		const group = buildIntakeGroup(MEETING_LINES, "Besprechung - Kickoff", OWN);
		const content = insertIntakeGroup(noteWith([]), group);
		const parsed = parseIntakeGroups(content)[0];

		const result = takeOverGroup(content, parsed, {
			taken: [{ text: "Max:", children: ["    - Angebot prüfen, 15.09.2026"] }],
			keptOwn: [],
			keptForeign: [],
		});

		expect(result).not.toBeNull();
		const lines = (result as { newContent: string }).newContent.split("\n");
		const boundary = lines.indexOf("#### Unsortiert");
		expect(lines.slice(0, boundary)).toContain("    - Angebot prüfen, 15.09.2026");
		// The group goes either way, ticked items or not.
		expect(parseIntakeGroups((result as { newContent: string }).newContent)).toHaveLength(0);
	});

	it("moves the whole group when no selection is given", () => {
		const group = buildIntakeGroup(MEETING_LINES, "Besprechung - Kickoff", OWN);
		const content = insertIntakeGroup(noteWith([]), group);
		const parsed = parseIntakeGroups(content)[0];

		const result = takeOverGroup(content, parsed);

		expect((result as { newContent: string }).newContent).toContain("- Max:\n    - Angebot prüfen");
	});
});
