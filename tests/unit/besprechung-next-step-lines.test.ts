import { describe, it, expect } from "vitest";
import { extractNextStepItemLines } from "../../src/features/besprechung/besprechung-engine";

const NOTE = [
	"# Nächste Schritte",
	"",
	"Max:",
	"",
	"- Angebot prüfen",
	"",
	"---",
	"",
	"# Zusammenfassung",
	"",
	"Nichts davon.",
].join("\n");

describe("extractNextStepItemLines", () => {
	it("keeps the header line and the bullets verbatim", () => {
		expect(extractNextStepItemLines(NOTE, ["Nächste Schritte"])).toEqual(["Max:", "- Angebot prüfen"]);
	});

	it("drops a thematic break, which would otherwise arrive as an item reading ---", () => {
		expect(extractNextStepItemLines(NOTE, ["Nächste Schritte"])).not.toContain("---");
	});
});
