import { describe, it, expect } from "vitest";
import {
	extractFiledMessageIds,
	formatThreadSection,
	type ThreadSectionMessage,
} from "../../src/features/email-filing/email-format-engine";

describe("extractFiledMessageIds", () => {
	it("returns the Message-IDs of message:// links in the content", () => {
		const content = "- siehe [E-Mail von Alice: Angebot](message://%3Cm1%3E)";
		const ids = extractFiledMessageIds(content);
		expect(ids.has("m1")).toBe(true);
		expect(ids.size).toBe(1);
	});

	it("returns an empty set when there are no message:// links", () => {
		expect(extractFiledMessageIds("# Inhalt\n- nothing here").size).toBe(0);
	});
});

describe("formatThreadSection", () => {
	const messages: ThreadSectionMessage[] = [
		{ direction: "in", dateSent: "2026-06-01T09:00:00Z", partyName: "Alice", body: "Hallo", attachments: [], messageUrl: "message://%3Cm2%3E" },
		{ direction: "out", dateSent: "2026-06-01T10:00:00Z", partyName: "Lukas", body: "Danke", attachments: [], messageUrl: "message://%3Cm3%3E" },
	];

	it("renders newest-first with the message link in the sub-header (no separate siehe line)", () => {
		const { sectionName, bodyLines } = formatThreadSection(messages, "Angebot", "de");
		expect(sectionName).toBe("E-Mail-Thread: Angebot");

		const lukasHeader = bodyLines.indexOf("**01.06.2026 — [Lukas](message://%3Cm3%3E) (gesendet):**");
		const aliceHeader = bodyLines.indexOf("**01.06.2026 — [Alice](message://%3Cm2%3E) (eingegangen):**");
		expect(lukasHeader).toBeGreaterThanOrEqual(0);
		expect(aliceHeader).toBeGreaterThan(lukasHeader); // newest (Lukas 10:00) first, then Alice (09:00)

		// The link lives in the sub-header; there is no separate "- siehe" line.
		expect(bodyLines.some((l) => l.startsWith("- siehe"))).toBe(false);
		expect(bodyLines[lukasHeader + 1]).toBe("Danke"); // body follows its sub-header
	});
});
