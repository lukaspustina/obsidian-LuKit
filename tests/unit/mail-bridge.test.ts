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
		const bridge = createOsascriptBridge({ Gmail: "[Gmail]/All Mail" }, "Archive", {}, "Sent");
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
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		await bridge.archive("iCloud", "id-1");

		const [, args] = execFileMock.mock.calls[0] as [string, string[]];
		expect(args).toContain("Archive");
	});

	it("sanitizes execFile errors — command line and script source never reach the message", async () => {
		execFileMock.mockImplementation(
			(_f: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) =>
				cb(
					new Error("Command failed: osascript -l JavaScript -e function run(argv){ SECRET_SCRIPT }"),
					"",
					"execution error: Error: Mail got an error: timed out (-2700)",
				),
		);
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		const err = await bridge.archive("iCloud", "id-1").then(
			() => null,
			(e: Error) => e,
		);

		expect(err).not.toBeNull();
		expect(err?.message).not.toContain("SECRET_SCRIPT");
		expect(err?.message).toContain("Mail-Zugriff fehlgeschlagen");
		expect(err?.message).toContain("-2700");
	});

	it("maps -1743 in stderr to the automation-permission message", async () => {
		execFileMock.mockImplementation(
			(_f: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) =>
				cb(new Error("Command failed: osascript …"), "", "execution error: Fehler (-1743)"),
		);
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		const err = await bridge.archive("iCloud", "id-1").then(
			() => null,
			(e: Error) => e,
		);

		expect(err?.message).toContain("Automatisierung");
	});

	it("explains a missing archive mailbox with account name and Gmail hint", async () => {
		execFileMock.mockImplementation(callbackWith("no-mailbox\n"));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		const err = await bridge.archive("Privat Gmail", "id-1").then(
			() => null,
			(e: Error) => e,
		);

		expect(err?.message).toContain("Archiv-Postfach");
		expect(err?.message).toContain("Privat Gmail");
		expect(err?.message).toContain("All Mail");
	});

	it("archive script resolves the mailbox via the fallback helper, not byName", async () => {
		execFileMock.mockImplementation(callbackWith("ok"));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		await bridge.archive("Privat Gmail", "id-1");

		const [, args] = execFileMock.mock.calls[0] as [string, string[]];
		const script = args[args.indexOf("-e") + 1];
		expect(script).toContain("lukitArchiveBox");
		expect(script).not.toContain("byName");
		expect(script).toContain("all mail");
	});

	it("reports a true/false inbox membership from the script output", async () => {
		execFileMock.mockImplementation(callbackWith("false\n"));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		expect(await bridge.isInInbox("iCloud", "id-1")).toBe(false);
	});

	it("throws lukit-not-found when the body script reports the message is gone", async () => {
		execFileMock.mockImplementation(callbackWith(JSON.stringify({ notFound: true })));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		await expect(bridge.fetchBody("iCloud", "id-1")).rejects.toThrow(/lukit-not-found/);
	});

	it("returns body and attachments on a successful fetch", async () => {
		execFileMock.mockImplementation(callbackWith(JSON.stringify({ body: "hi", attachments: [] })));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		expect(await bridge.fetchBody("iCloud", "id-1")).toEqual({ body: "hi", attachments: [] });
	});

	it("surfaces a readable error on TCC denial (-1743)", async () => {
		execFileMock.mockImplementation(
			(_f: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string) => void) =>
				cb(new Error("execution error: Not authorized ... (-1743)"), ""),
		);
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		await expect(bridge.archive("iCloud", "id-1")).rejects.toThrow(/Automatisierung/);
	});

	it("derives getSelection direction from the mailbox name (locale-agnostic)", async () => {
		execFileMock.mockImplementation(
			callbackWith(
				JSON.stringify([
					{ id: "s1", accountName: "CenterDevice", mailboxName: "Gesendet", subject: "X", sender: "Ich <me@x.de>", toName: "Bob", toAddress: "bob@x.de", dateSent: "2026-07-01T00:00:00Z", body: "b", attachments: [] },
					{ id: "s2", accountName: "iCloud", mailboxName: "INBOX", subject: "Y", sender: "Alice <alice@x.com>", toName: "", toAddress: "", dateSent: "2026-07-01T00:00:00Z", body: "b", attachments: [] },
				]),
			),
		);
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		const sel = await bridge.getSelection();
		expect(sel[0].direction).toBe("out"); // "Gesendet" → out
		expect(sel[0].partyAddress).toBe("bob@x.de"); // out → first To
		expect(sel[1].direction).toBe("in"); // "INBOX" → in
		expect(sel[1].partyAddress).toBe("alice@x.com"); // in → sender address
	});
});
