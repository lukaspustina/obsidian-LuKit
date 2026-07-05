import { describe, it, expect } from "vitest";
import { formatEmailSection, type EmailMeta } from "../../src/features/email-filing/email-format-engine";

const attach = (name: string, mimeType: string, size: number) => ({ name, mimeType, size });

const meta = (senderName: string, subject: string, messageUrl: string): EmailMeta => ({
	senderName,
	subject,
	dateSent: new Date(2026, 5, 30),
	messageUrl,
});

describe("SDD email-attachments p1 c9", () => {
	it("mixes wikilink and plain-text attachment names via the new savedNames parameter", () => {
		const savedNames = new Map([["rechnung.pdf", "rechnung 2.pdf"]]);

		const { bodyLines } = formatEmailSection(
			meta("Erika Beispiel", "Rechnung", "message://example%40example.com"),
			"",
			[attach("rechnung.pdf", "application/pdf", 12345), attach("foto.jpg", "image/jpeg", 54321)],
			"de",
			savedNames,
		);

		expect(bodyLines).toContain("Anhänge: [[rechnung 2.pdf]], foto.jpg");
	});
});
