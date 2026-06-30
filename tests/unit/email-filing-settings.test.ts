import { describe, it, expect } from "vitest";
import { mergeDetectedAccounts, isAccountIncluded } from "../../src/features/email-filing/email-filing-settings";

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

describe("isAccountIncluded", () => {
	it("includes accounts not present in the map (default on)", () => {
		expect(isAccountIncluded({}, "iCloud")).toBe(true);
	});

	it("excludes accounts explicitly set to false", () => {
		expect(isAccountIncluded({ Gmail: false }, "Gmail")).toBe(false);
	});

	it("includes accounts explicitly set to true", () => {
		expect(isAccountIncluded({ Gmail: true }, "Gmail")).toBe(true);
	});
});
