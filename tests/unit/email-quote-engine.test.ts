import { describe, it, expect } from "vitest";
import { parseEmailBody } from "../../src/features/email-filing/email-quote-engine";

describe("parseEmailBody", () => {
	it("keeps new text above an Apple Mail attribution and quotes the rest", () => {
		const raw = [
			"New text here",
			"maybe more",
			"Am 01.06.2026 um 10:00 schrieb Max:",
			"> quoted line",
			"> more quoted",
		].join("\n");
		const { body, quoted } = parseEmailBody(raw);
		expect(body).toBe("New text here\nmaybe more");
		expect(body).not.toContain(">");
		expect(quoted).toContain("Am 01.06.2026 um 10:00 schrieb Max:");
		expect(quoted).toContain("> quoted line");
	});

	it("removes a German Outlook Von/Gesendet/An/Betreff block and everything below", () => {
		const raw = [
			"My reply",
			"",
			"Von: Max Mustermann",
			"Gesendet: Montag, 1. Juni 2026 10:00",
			"An: Lukas",
			"Betreff: Test",
			"",
			"old content",
		].join("\n");
		const { body } = parseEmailBody(raw);
		expect(body).toBe("My reply");
		expect(body).not.toContain("Von:");
		expect(body).not.toContain("old content");
	});

	it("splits off a '-- ' signature", () => {
		const raw = "Body text\n-- \nLukas Pustina";
		const { body, signature } = parseEmailBody(raw);
		expect(signature.startsWith("-- ")).toBe(true);
		expect(body).not.toContain("-- ");
		expect(body).not.toContain("Lukas Pustina");
		expect(body).toBe("Body text");
	});

	it("returns an empty body for a fully-quoted forward with no new content", () => {
		const raw = [
			"Am 01.06.2026 um 10:00 schrieb Max:",
			"> everything",
			"> is quoted",
		].join("\n");
		const { body } = parseEmailBody(raw);
		expect(body).toBe("");
	});

	it("cuts a German closing salutation and the signature below it", () => {
		const raw = [
			"Danke für die Info.",
			"",
			"Mit freundlichen Grüßen",
			"Max Mustermann",
			"Scopevisio AG",
			"Tel: 0228 1234",
		].join("\n");
		const { body, signature } = parseEmailBody(raw);
		expect(body).toBe("Danke für die Info.");
		expect(signature).toContain("Mit freundlichen Grüßen");
		expect(body).not.toContain("Scopevisio AG");
	});

	it("cuts a standalone salutation abbreviation", () => {
		const { body } = parseEmailBody("Passt so.\nVG\nMax");
		expect(body).toBe("Passt so.");
	});

	it("cuts a German legal disclaimer without a salutation", () => {
		const raw = [
			"Hier ist die Datei.",
			"Diese E-Mail enthält vertrauliche Informationen und ist nur für den Empfänger bestimmt.",
		].join("\n");
		const { body } = parseEmailBody(raw);
		expect(body).toBe("Hier ist die Datei.");
	});

	it("cuts an English closing salutation", () => {
		const { body } = parseEmailBody("Sounds good.\n\nBest regards,\nAlice");
		expect(body).toBe("Sounds good.");
	});

	it("does not cut a salutation word used mid-sentence (under-trim)", () => {
		const raw = "Ich grüße dich herzlich. Wie läuft das Projekt?";
		const { body } = parseEmailBody(raw);
		expect(body).toBe(raw);
	});

	it("retains non-quoted inline-reply text after an attribution line (under-trim)", () => {
		const raw = [
			"Am 01.06.2026 schrieb Max:",
			"> question one",
			"My inline answer",
			"> question two",
			"Another answer",
		].join("\n");
		const { body } = parseEmailBody(raw);
		expect(body).toContain("My inline answer");
		expect(body).toContain("Another answer");
		expect(body).not.toContain(">");
	});
});
