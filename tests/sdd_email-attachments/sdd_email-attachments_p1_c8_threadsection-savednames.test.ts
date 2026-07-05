import { describe, it, expect } from "vitest";
import { formatThreadSection, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c8", () => {
	it("renders saved attachments as wikilinks mixed with plain-text attachments, order unchanged", () => {
		const messages: ThreadSectionMessage[] = [
			{
				direction: "in",
				dateSent: "2026-06-01T09:00:00Z",
				partyName: "Erika Beispiel",
				body: "Hallo",
				attachments: [
					{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1024 },
					{ name: "foto.jpg", mimeType: "image/jpeg", size: 2048 },
				],
				messageUrl: "message://%3Cm1%3E",
				savedNames: new Map([["rechnung.pdf", "rechnung 2.pdf"]]),
			},
		];

		const { bodyLines } = formatThreadSection(messages, "Angebot", "de");

		expect(bodyLines).toContain("Anhänge: [[rechnung 2.pdf]], foto.jpg");
	});
});
