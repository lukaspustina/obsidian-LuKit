import { describe, it, expect } from "vitest";
import {
	buildMessageUrl,
	sanitizeSenderSubject,
	stripSubjectPrefixes,
	filterAttachments,
	formatEmailSection,
	threadKey,
	type EmailMeta,
} from "../../src/features/email-filing/email-format-engine";

const attach = (name: string, mimeType: string, size: number) => ({ name, mimeType, size });

const meta = (senderName: string, subject: string, messageUrl: string): EmailMeta => ({
	senderName,
	subject,
	dateSent: new Date(2026, 5, 30),
	messageUrl,
});

describe("filterAttachments", () => {
	it("drops auto-generated inline images but keeps real attachments, without mutating input", () => {
		const all = [
			attach("image001.png", "image/png", 2048),
			attach("image042.JPG", "", -1),
			attach("Angebot.pdf", "application/pdf", 81920),
		];
		const snapshot = [...all];
		const result = filterAttachments(all);
		expect(result.map((a) => a.name)).toEqual(["Angebot.pdf"]);
		expect(all).toEqual(snapshot);
	});

	it("keeps a real attachment even when mimeType is unreadable (empty)", () => {
		// JXA mimeType() often throws → bridge returns "". Must not drop the file.
		expect(filterAttachments([attach("Rechnung.pdf", "", -1)]).map((a) => a.name)).toEqual([
			"Rechnung.pdf",
		]);
	});

	it("keeps a real image attachment with a meaningful name", () => {
		expect(
			filterAttachments([attach("Foto_Urlaub.jpg", "", -1)]).map((a) => a.name),
		).toEqual(["Foto_Urlaub.jpg"]);
	});
});

describe("stripSubjectPrefixes", () => {
	it("strips repeated reply/forward prefixes", () => {
		expect(stripSubjectPrefixes("FWD: Re: AW: Topic")).toBe("Topic");
	});

	it("falls back to the original subject when stripping empties it", () => {
		expect(stripSubjectPrefixes("AW:")).toBe("AW:");
	});
});

describe("sanitizeSenderSubject", () => {
	it("removes characters that collide with the heading convention or markdown links", () => {
		const out = sanitizeSenderSubject("Pustina, Lukas |#x ]]");
		expect(out).not.toMatch(/[,#|]/);
		expect(out).not.toContain("]]");
	});
});

describe("threadKey", () => {
	it("normalizes a subject to a thread identity (prefixes stripped, lowercased)", () => {
		expect(threadKey("AW: Re: Quartalsbericht Q3")).toBe("quartalsbericht q3");
	});

	it("maps replies and the original to the same key", () => {
		expect(threadKey("Quartalsbericht Q3")).toBe(threadKey("Re:  Quartalsbericht   Q3"));
	});
});

describe("buildMessageUrl", () => {
	it("wraps the bare message id in encoded angle brackets", () => {
		expect(buildMessageUrl("foo@bar.com")).toBe("message://%3Cfoo@bar.com%3E");
	});
});

describe("formatEmailSection", () => {
	it("sanitizes sender/subject and emits only the link line for an empty body", () => {
		const { sectionName, bodyLines } = formatEmailSection(
			meta("Pustina, Lukas", "AW: Angebot [#123]", "message://a%40b"),
			"",
			[],
			"de",
		);
		expect(sectionName).not.toMatch(/[,#|]/);
		expect(sectionName).not.toContain("]]");
		expect(bodyLines).toHaveLength(1);
		expect(bodyLines[0].startsWith("- siehe [E-Mail von ")).toBe(true);
	});

	it("emits link, body, and Anhänge lines in order", () => {
		const url = "message://m%40x";
		const { bodyLines } = formatEmailSection(
			meta("Alice", "Re: Meeting", url),
			"Sounds good.",
			[attach("Brief.pdf", "application/pdf", 81920)],
			"de",
		);
		expect(bodyLines).toEqual([
			`- siehe [E-Mail von Alice: Meeting](${url})`,
			"Sounds good.",
			"Anhänge: Brief.pdf",
		]);
	});

	it("strips all recognized prefixes for the section name", () => {
		const { sectionName } = formatEmailSection(
			meta("Bob", "FWD: Re: AW: Topic", "message://x"),
			"",
			[],
			"de",
		);
		expect(sectionName).toBe("E-Mail von Bob: Topic");
	});

	it("falls back to the original subject when it is prefix-only", () => {
		const { sectionName } = formatEmailSection(
			meta("Bob", "AW:", "message://x"),
			"",
			[],
			"de",
		);
		expect(sectionName).toBe("E-Mail von Bob: AW:");
	});
});
