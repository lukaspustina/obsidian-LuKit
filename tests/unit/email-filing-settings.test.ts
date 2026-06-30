import { describe, it, expect } from "vitest";
import { mergeDetectedAccounts } from "../../src/features/email-filing/email-filing-settings";

describe("mergeDetectedAccounts", () => {
	it("adds missing detected accounts with the default mailbox, leaving existing entries untouched", () => {
		const result = mergeDetectedAccounts({ iCloud: "Archive" }, ["iCloud", "Gmail"], "Archive");
		expect(result).toEqual({ iCloud: "Archive", Gmail: "Archive" });
	});

	it("does not overwrite an existing account's mailbox", () => {
		const result = mergeDetectedAccounts({ Gmail: "[Gmail]/All Mail" }, ["Gmail"], "Archive");
		expect(result.Gmail).toBe("[Gmail]/All Mail");
	});
});
