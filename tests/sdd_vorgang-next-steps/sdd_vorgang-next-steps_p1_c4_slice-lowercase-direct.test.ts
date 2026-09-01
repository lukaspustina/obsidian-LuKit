// `sliceSectionBody` is currently module-private (not exported) in
// vorgang-engine.ts. This import is expected to fail to resolve until the
// implementer exports it — that unresolved-symbol failure IS the correct RED
// state for this criterion; making the helper available to the test is part
// of the implementation, not of this test.
import { describe, it, expect } from "vitest";
import { sliceSectionBody } from "../../src/features/vorgang/vorgang-engine";

describe("sliceSectionBody recognises the lowercase spelling directly (SDD vorgang-next-steps p1 c4)", () => {
	it("returns the section body of a lowercase-spelled '# nächste Schritte' note instead of empty", () => {
		const lines = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Fact",
			"",
			"# nächste Schritte",
			"- Do X",
			"- Do Y",
			"",
			"# Inhalt",
			"",
		];

		const body = sliceSectionBody(lines, "# Nächste Schritte");

		expect(body).toEqual(["- Do X", "- Do Y"]);
	});
});
