import { describe, it, expect } from "vitest";
import { buildTriagePreview } from "../../src/features/task-triage/task-triage-engine";

describe("buildTriagePreview - Vorgang note with Fakten und Pointer and multiple h5 sections", () => {
	it("includes the Fakten section and only the topmost (newest) h5 section", () => {
		const content = `# Fakten und Pointer
- Kunde: Acme
- Ansprechpartner: Max Mustermann

# Inhalt
- [[#Abschnitt C, 01.07.2026]]
- [[#Abschnitt B, 30.06.2026]]
- [[#Abschnitt A, 29.06.2026]]

##### Abschnitt C, 01.07.2026
- Neueste Notiz zu Abschnitt C

##### Abschnitt B, 30.06.2026
- Mittlere Notiz zu Abschnitt B

##### Abschnitt A, 29.06.2026
- Älteste Notiz zu Abschnitt A
`;

		const preview = buildTriagePreview(content);

		expect(preview).toContain("Kunde: Acme");
		expect(preview).toContain("Ansprechpartner: Max Mustermann");
		expect(preview).toContain("Neueste Notiz zu Abschnitt C");
		expect(preview).not.toContain("Mittlere Notiz zu Abschnitt B");
		expect(preview).not.toContain("Älteste Notiz zu Abschnitt A");
	});
});
