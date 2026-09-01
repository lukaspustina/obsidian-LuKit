// `sliceSectionBody` is currently module-private (not exported) in
// vorgang-engine.ts. This import is expected to fail to resolve until the
// implementer exports it — that unresolved-symbol failure IS the correct RED
// state for this criterion; making the helper available to the test is part
// of the implementation, not of this test.
//
// The lowercase heading is placed BEFORE the canonical one in the fixture on
// purpose: a naive "first matching spelling found in document order" fix
// would pick up the lowercase section here, while the correct
// canonical-first NEXT_STEP_HEADERS precedence (matching the FAKTEN_HEADERS
// pattern) must still resolve to the canonical section regardless of where
// each spelling sits in the file.
import { describe, it, expect } from "vitest";
import { sliceSectionBody } from "../../src/features/vorgang/vorgang-engine";

describe("sliceSectionBody prefers the canonical spelling when both are present (SDD vorgang-next-steps p1 c3)", () => {
	it("returns the '# Nächste Schritte' section's own body, not the '# nächste Schritte' one", () => {
		const lines = [
			"---",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Fact",
			"",
			"# nächste Schritte",
			"- Lowercase bullet",
			"# Nächste Schritte",
			"- Canonical bullet",
			"",
			"# Inhalt",
			"",
		];

		const body = sliceSectionBody(lines, "# Nächste Schritte");

		expect(body).toEqual(["- Canonical bullet", ""]);
	});
});
