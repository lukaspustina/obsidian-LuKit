import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture execFile calls without spawning anything. vi.hoisted so the mock
// factory can reference the spy.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("child_process", () => ({ execFile: execFileMock }));

import { createOsascriptBridge } from "../../src/features/email-filing/mail-bridge";

const callbackWith = (stdout: string) => (_f: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string) => void) => cb(null, stdout);

describe("createOsascriptBridge — argv safety and mailbox resolution", () => {
	beforeEach(() => {
		execFileMock.mockReset();
	});

	it("passes runtime values as argv, never interpolated into the script source", async () => {
		execFileMock.mockImplementation(callbackWith("ok"));
		const bridge = createOsascriptBridge({ Gmail: "[Gmail]/All Mail" }, "Archive");
		const dangerousId = `x" ; do shell script "rm -rf /" //`;

		await bridge.archive("Gmail", dangerousId);

		const [file, args] = execFileMock.mock.calls[0] as [string, string[]];
		expect(file).toBe("osascript");
		const script = args[args.indexOf("-e") + 1];
		// The dangerous id must NOT be baked into the script source...
		expect(script).not.toContain(dangerousId);
		// ...it must travel as a separate argv element.
		expect(args).toContain(dangerousId);
		// Mailbox resolved from the per-account map, also passed as argv.
		expect(args).toContain("[Gmail]/All Mail");
	});

	it("falls back to defaultArchiveMailbox for an unmapped account", async () => {
		execFileMock.mockImplementation(callbackWith("ok"));
		const bridge = createOsascriptBridge({}, "Archive");

		await bridge.archive("iCloud", "id-1");

		const [, args] = execFileMock.mock.calls[0] as [string, string[]];
		expect(args).toContain("Archive");
	});

	it("reports a true/false inbox membership from the script output", async () => {
		execFileMock.mockImplementation(callbackWith("false\n"));
		const bridge = createOsascriptBridge({}, "Archive");
		expect(await bridge.isInInbox("iCloud", "id-1")).toBe(false);
	});

	it("throws lukit-not-found when the body script reports the message is gone", async () => {
		execFileMock.mockImplementation(callbackWith(JSON.stringify({ notFound: true })));
		const bridge = createOsascriptBridge({}, "Archive");
		await expect(bridge.fetchBody("iCloud", "id-1")).rejects.toThrow(/lukit-not-found/);
	});

	it("returns body and attachments on a successful fetch", async () => {
		execFileMock.mockImplementation(callbackWith(JSON.stringify({ body: "hi", attachments: [] })));
		const bridge = createOsascriptBridge({}, "Archive");
		expect(await bridge.fetchBody("iCloud", "id-1")).toEqual({ body: "hi", attachments: [] });
	});

	it("surfaces a readable error on TCC denial (-1743)", async () => {
		execFileMock.mockImplementation(
			(_f: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string) => void) =>
				cb(new Error("execution error: Not authorized ... (-1743)"), ""),
		);
		const bridge = createOsascriptBridge({}, "Archive");
		await expect(bridge.archive("iCloud", "id-1")).rejects.toThrow(/Automatisierung/);
	});
});
