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

	it("renders both directions in date order with the link after each body", () => {
		const { sectionName, bodyLines } = formatThreadSection(messages, "Angebot", "de");
		expect(sectionName).toBe("E-Mail-Thread: Angebot");

		const aliceHeader = bodyLines.indexOf("**01.06.2026 — Alice (eingegangen):**");
		const lukasHeader = bodyLines.indexOf("**01.06.2026 — Lukas (gesendet):**");
		expect(aliceHeader).toBeGreaterThanOrEqual(0);
		expect(lukasHeader).toBeGreaterThan(aliceHeader);

		const m2Link = bodyLines.findIndex((l) => l.includes("message://%3Cm2%3E"));
		const m3Link = bodyLines.findIndex((l) => l.includes("message://%3Cm3%3E"));
		expect(m2Link).toBeGreaterThan(aliceHeader); // link after its sub-header/body
		expect(m3Link).toBeGreaterThan(m2Link); // m2 block before m3 block
		expect(bodyLines[aliceHeader + 1]).toBe("Hallo"); // body precedes the link
	});
});
