import { describe, it, expect } from "vitest";
import type { MailBridge } from "../../src/features/email-filing/mail-bridge";

describe("SDD email-attachments p1 c11", () => {
	it("returns only the confirmed attachmentName on partial success", async () => {
		const save: MailBridge["saveAttachments"] = async (_accountName, _messageId, items) => [
			items[0].attachmentName,
		];

		const result = await save("Acme", "m@1", [
			{ attachmentName: "a.pdf", destPath: "/abs/a.pdf" },
			{ attachmentName: "b.pdf", destPath: "/abs/b.pdf" },
		]);

		expect(result).toEqual(["a.pdf"]);
	});
});
