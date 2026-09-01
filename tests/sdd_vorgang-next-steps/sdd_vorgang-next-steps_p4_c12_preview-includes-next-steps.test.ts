// Phase 4, criterion 12 (Test Scenarios #12):
// GIVEN any Vorgang stop (task, reminder, or intake), WHEN a preview is built,
// THEN it contains "# Nächste Schritte" with the literal "#### Unsortiert"
// heading separating the curated part from the intake (requirement 40).
// buildTriagePreview's signature is unchanged; this is a global change to the
// function itself, so it is pinned here directly rather than through a stop.
//
// buildTriagePreview does not include "# Nächste Schritte" at all yet —
// referencing that expectation is the intended RED state.

import { describe, it, expect } from "vitest";
import { buildTriagePreview } from "../../src/features/task-triage/task-triage-engine";

describe("buildTriagePreview — Nächste Schritte with the Unsortiert boundary (Req 40, P4 C12)", () => {
	it("includes the curated part and the boundary heading when the intake is empty", () => {
		const content = [
			"# Fakten und Pointer",
			"- Kunde: Acme",
			"",
			"# Nächste Schritte",
			"- Eigener kuratierter Punkt",
			"",
			"#### Unsortiert",
			"",
			"# Inhalt",
			"- [[#Abschnitt A, 01.07.2026]]",
			"",
			"##### Abschnitt A, 01.07.2026",
			"- Notiz A",
		].join("\n");

		const preview = buildTriagePreview(content);

		expect(preview).toContain("# Nächste Schritte");
		expect(preview).toContain("Eigener kuratierter Punkt");
		expect(preview).toContain("#### Unsortiert");
		expect(preview.indexOf("Eigener kuratierter Punkt")).toBeLessThan(preview.indexOf("#### Unsortiert"));
	});

	it("includes the intake below the boundary when it holds a group", () => {
		const content = [
			"# Fakten und Pointer",
			"- Kunde: Acme",
			"",
			"# Nächste Schritte",
			"- Eigener kuratierter Punkt",
			"",
			"#### Unsortiert",
			"- Aus [[Besprechung Acme Kickoff]]",
			"    - Angebot einholen",
			"",
			"# Inhalt",
			"- [[#Abschnitt A, 01.07.2026]]",
			"",
			"##### Abschnitt A, 01.07.2026",
			"- Notiz A",
		].join("\n");

		const preview = buildTriagePreview(content);

		expect(preview).toContain("# Nächste Schritte");
		expect(preview).toContain("#### Unsortiert");
		expect(preview).toContain("Aus [[Besprechung Acme Kickoff]]");
		expect(preview).toContain("Angebot einholen");

		const boundaryIdx = preview.indexOf("#### Unsortiert");
		expect(preview.indexOf("Eigener kuratierter Punkt")).toBeLessThan(boundaryIdx);
		expect(preview.indexOf("Aus [[Besprechung Acme Kickoff]]")).toBeGreaterThan(boundaryIdx);
	});
});
