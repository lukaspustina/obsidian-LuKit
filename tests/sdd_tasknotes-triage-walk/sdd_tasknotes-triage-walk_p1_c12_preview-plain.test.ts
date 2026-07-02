import { describe, it, expect } from "vitest";
import { buildTriagePreview } from "../../src/features/task-triage/task-triage-engine";

describe("buildTriagePreview - note without Fakten und Pointer heading", () => {
	it("returns the full original body unmodified", () => {
		const content = [
			"# Aufgabe",
			"",
			"Rufe Max Mustermann wegen des Angebots an.",
			"",
			"##### Details, 01.07.2026",
			"- Erika Beispiel hat den Vertrag geprüft.",
		].join("\n");

		expect(buildTriagePreview(content)).toBe(content);
	});
});
