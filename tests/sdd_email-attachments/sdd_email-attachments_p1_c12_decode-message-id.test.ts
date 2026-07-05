import { describe, it, expect } from "vitest";
import {
	buildMessageUrl,
	decodeMessageIdFromUrl,
	extractFiledMessageIds,
} from "../../src/features/email-filing/email-format-engine";

describe("SDD email-attachments p1 c12", () => {
	it("roundtrips a message-id built via buildMessageUrl", () => {
		const url = buildMessageUrl("abc@example.com");

		expect(decodeMessageIdFromUrl(url)).toBe("abc@example.com");
	});

	it("returns null for a non-matching string", () => {
		expect(decodeMessageIdFromUrl("https://example.com")).toBeNull();
	});

	it("returns the raw captured id when decodeURIComponent throws on a malformed percent-escape", () => {
		const url = "message://%3Cbroken%E0%A4%A%3E";

		expect(decodeMessageIdFromUrl(url)).toBe("broken%E0%A4%A");
	});

	it("extractFiledMessageIds still yields the same id for the same match (parity pin)", () => {
		const url = "message://%3Cbroken%E0%A4%A%3E";
		const vorgangContent = `Anhänge: [foo](${url})`;

		const ids = extractFiledMessageIds(vorgangContent);

		expect(ids.has("broken%E0%A4%A")).toBe(true);
	});
});
