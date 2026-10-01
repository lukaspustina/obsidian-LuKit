import { describe, it, expect } from "vitest";
import { formatEmailSection, type EmailMeta } from "../../src/features/email-filing/email-format-engine";

const attach = (name: string) => ({ name, mimeType: "application/octet-stream", size: 1000 });

const meta: EmailMeta = {
	senderName: "Erika Beispiel",
	subject: "Unterlagen",
	dateSent: new Date(2026, 9, 1),
	messageUrl: "message://example%40example.com",
};

function attachmentsLine(names: string[], saved: string[]): string | undefined {
	const savedNames = new Map(saved.map((n) => [n, n]));
	const { bodyLines } = formatEmailSection(meta, "", names.map(attach), "de", savedNames);
	return bodyLines.find((l) => l.startsWith("Anhänge: "));
}

describe("attachment embeds", () => {
	it("embeds images, PDFs and Office documents, case-insensitively", () => {
		const names = ["scan.PDF", "foto.jpeg", "angebot.docx", "liste.xlsx", "folien.pptx"];
		expect(attachmentsLine(names, names)).toBe(
			"Anhänge: ![[scan.PDF]], ![[foto.jpeg]], ![[angebot.docx]], ![[liste.xlsx]], ![[folien.pptx]]",
		);
	});

	it("keeps other saved files as plain wikilinks", () => {
		expect(attachmentsLine(["archiv.zip", "termin.ics", "ohne-endung"], ["archiv.zip", "termin.ics", "ohne-endung"])).toBe(
			"Anhänge: [[archiv.zip]], [[termin.ics]], [[ohne-endung]]",
		);
	});

	it("leaves unsaved attachments as plain text", () => {
		expect(attachmentsLine(["scan.pdf", "foto.jpg"], ["foto.jpg"])).toBe("Anhänge: scan.pdf, ![[foto.jpg]]");
	});
});
