import { describe, it, expect } from "vitest";
import {
	formatEmailSection,
	formatThreadSection,
	type EmailMeta,
	type MailAttachment,
	type ThreadSectionMessage,
} from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c10", () => {
	const attachments: MailAttachment[] = [
		{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1024 },
		{ name: "foto.jpg", mimeType: "image/jpeg", size: 2048 },
	];

	it("formatThreadSection renders plain-text Anhänge line without savedNames", () => {
		const messages: ThreadSectionMessage[] = [
			{
				direction: "in",
				partyName: "Max Mustermann",
				dateSent: "2026-06-01T09:00:00Z",
				body: "Hallo",
				attachments,
				messageUrl: "message://%3Cm1%3E",
			},
		];

		const { bodyLines } = formatThreadSection(messages, "Angebot", "de");

		expect(bodyLines).toContain("Anhänge: rechnung.pdf, foto.jpg");
		expect(bodyLines.some((l) => l.includes("[["))).toBe(false);
	});

	it("formatEmailSection renders plain-text Anhänge line without a 5th argument", () => {
		const meta: EmailMeta = {
			senderName: "Erika Beispiel",
			subject: "Angebot",
			dateSent: new Date("2026-06-01T09:00:00Z"),
			messageUrl: "message://%3Cm1%3E",
		};

		const { bodyLines } = formatEmailSection(meta, "Hallo", attachments, "de");

		expect(bodyLines).toContain("Anhänge: rechnung.pdf, foto.jpg");
		expect(bodyLines.some((l) => l.includes("[["))).toBe(false);
	});
});
