import { describe, it, expect } from "vitest";
import { buildTriagePreview } from "../../src/features/task-triage/task-triage-engine";

describe("buildTriagePreview — Vorgang edge cases", () => {
	it("still trims a Vorgang whose Fakten und Pointer section is empty", () => {
		const content = [
			"# Fakten und Pointer",
			"",
			"# Inhalt",
			"- [[#Abschnitt B, 02.07.2026]]",
			"- [[#Abschnitt A, 01.07.2026]]",
			"",
			"##### Abschnitt B, 02.07.2026",
			"- Neue Notiz",
			"",
			"##### Abschnitt A, 01.07.2026",
			"- Alte Notiz",
		].join("\n");

		const preview = buildTriagePreview(content);

		expect(preview).toContain("# Fakten und Pointer");
		expect(preview).toContain("Neue Notiz");
		// Trimmed view, not the raw note: the Inhalt TOC must be gone.
		expect(preview).not.toContain("# Inhalt");
	});

	it("does not duplicate h5 headings inside the Fakten section or let them consume the section budget", () => {
		const content = [
			"# Fakten und Pointer",
			"- Kunde: Acme",
			"",
			"##### Eingebetteter Fakt",
			"- Detail im Faktenblock",
			"",
			"# Inhalt",
			"- [[#Abschnitt C, 02.07.2026]]",
			"",
			"##### Abschnitt C, 02.07.2026",
			"- Notiz C",
			"",
			"##### Abschnitt B, 01.07.2026",
			"- Notiz B",
			"",
			"##### Abschnitt A, 30.06.2026",
			"- Notiz A",
		].join("\n");

		const preview = buildTriagePreview(content);

		// The embedded h5 appears exactly once (inside the Fakten body).
		expect(preview.match(/##### Eingebetteter Fakt/g)).toHaveLength(1);
		// All three dated sections fit the budget — the embedded h5 no longer counts.
		expect(preview).toContain("Notiz C");
		expect(preview).toContain("Notiz B");
		expect(preview).toContain("Notiz A");
	});
});
