import { describe, it, expect } from "vitest";
import { buildTriagePreview } from "../../src/features/task-triage/task-triage-engine";

describe("buildTriagePreview - frontmatter stripping (Req 6)", () => {
	it("strips a leading frontmatter block from a non-Vorgang note", () => {
		const content = [
			"---",
			"status: open",
			"tags: [task]",
			"due: 2026-07-01",
			"---",
			"",
			"Call Max Mustermann about the Acme order.",
		].join("\n");

		const preview = buildTriagePreview(content);

		expect(preview).not.toContain("---");
		expect(preview).not.toContain("status: open");
		expect(preview).not.toContain("tags: [task]");
		expect(preview).not.toContain("due: 2026-07-01");
		expect(preview).toContain("Call Max Mustermann about the Acme order.");
	});

	it("strips a leading frontmatter block from a Vorgang-style note", () => {
		const content = [
			"---",
			"status: open",
			"tags: [Vorgang]",
			"---",
			"",
			"# Fakten und Pointer",
			"- Acme is the customer",
			"",
			"# Inhalt",
			"- [[#Kickoff, 02.07.2026]]",
			"- [[#Angebot, 01.07.2026]]",
			"",
			"---",
			"",
			"##### Kickoff, 02.07.2026",
			"- Erika Beispiel joined the call",
			"",
			"##### Angebot, 01.07.2026",
			"- Sent the offer to Petra Schneider",
		].join("\n");

		const preview = buildTriagePreview(content);

		expect(preview).not.toContain("status: open");
		expect(preview).not.toContain("tags: [Vorgang]");
	});
});
