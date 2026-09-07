import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Capture spawn calls without starting anything. vi.hoisted so the mock factory
// can reference the spy.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", () => ({ spawn: spawnMock }));

import { createOsascriptBridge } from "../../src/features/email-filing/mail-bridge";

interface FakeChild extends EventEmitter {
	stdout: EventEmitter & { setEncoding(enc: string): void };
	stderr: EventEmitter & { setEncoding(enc: string): void };
	stdin: { on(event: string, cb: () => void): void; end(chunk: string): void };
	/** What runJxa wrote to stdin — the script source, for the argv-safety checks. */
	script: string;
}

// A ChildProcess double: records the script written to stdin, then delivers the
// canned result. runJxa attaches every handler before calling stdin.end(), so
// emitting from there is safe; the timeout keeps the async shape realistic.
const fakeSpawn = (result: { stdout?: string; stderr?: string; code?: number | null; signal?: string }) => () => {
	const stream = () => Object.assign(new EventEmitter(), { setEncoding: () => undefined });
	const child = new EventEmitter() as FakeChild;
	child.stdout = stream();
	child.stderr = stream();
	child.script = "";
	child.stdin = {
		on: () => undefined,
		end: (chunk: string) => {
			child.script = chunk;
			setTimeout(() => {
				if (result.stdout !== undefined) child.stdout.emit("data", result.stdout);
				if (result.stderr !== undefined) child.stderr.emit("data", result.stderr);
				child.emit("close", result.code === undefined ? 0 : result.code, result.signal ?? null);
			}, 0);
		},
	};
	return child;
};

const spawnWith = (stdout: string) => fakeSpawn({ stdout });
const scriptOf = (call = 0): string => (spawnMock.mock.results[call].value as FakeChild).script;
const argsOf = (call = 0): string[] => (spawnMock.mock.calls[call] as [string, string[]])[1];

describe("createOsascriptBridge — argv safety and mailbox resolution", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("passes runtime values as argv, never interpolated into the script source", async () => {
		spawnMock.mockImplementation(spawnWith("ok"));
		const bridge = createOsascriptBridge({ Gmail: "[Gmail]/All Mail" }, "Archive", {}, "Sent");
		const dangerousId = `x" ; do shell script "rm -rf /" //`;

		await bridge.archive("Gmail", dangerousId);

		const [file, args] = spawnMock.mock.calls[0] as [string, string[]];
		expect(file).toBe("osascript");
		// The script travels on stdin, so it must not appear in argv at all.
		expect(args.slice(0, 3)).toEqual(["-l", "JavaScript", "-"]);
		expect(args).not.toContain("-e");
		// The dangerous id must NOT be baked into the script source...
		expect(scriptOf()).not.toContain(dangerousId);
		// ...it must travel as a separate argv element.
		expect(args).toContain(dangerousId);
		// Mailbox resolved from the per-account map, also passed as argv.
		expect(args).toContain("[Gmail]/All Mail");
	});

	it("falls back to defaultArchiveMailbox for an unmapped account", async () => {
		spawnMock.mockImplementation(spawnWith("ok"));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		await bridge.archive("iCloud", "id-1");

		expect(argsOf()).toContain("Archive");
	});

	it("sanitizes osascript errors — the script source never reaches the message", async () => {
		spawnMock.mockImplementation(
			fakeSpawn({ code: 1, stderr: "execution error: Error: Mail got an error: timed out (-2700)" }),
		);
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		const err = await bridge.archive("iCloud", "id-1").then(
			() => null,
			(e: Error) => e,
		);

		expect(err).not.toBeNull();
		expect(err?.message).not.toContain("lukitArchiveBox");
		expect(err?.message).toContain("Mail-Zugriff fehlgeschlagen");
		expect(err?.message).toContain("-2700");
	});

	it("maps -1743 in stderr to the automation-permission message", async () => {
		spawnMock.mockImplementation(fakeSpawn({ code: 1, stderr: "execution error: Fehler (-1743)" }));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		const err = await bridge.archive("iCloud", "id-1").then(
			() => null,
			(e: Error) => e,
		);

		expect(err?.message).toContain("Automatisierung");
	});

	it("names the signal when osascript is killed without writing anything", async () => {
		spawnMock.mockImplementation(fakeSpawn({ code: null, signal: "SIGKILL" }));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		const err = await bridge.archive("iCloud", "id-1").then(
			() => null,
			(e: Error) => e,
		);

		expect(err?.message).toContain("SIGKILL");
		expect(err?.message).toContain("EDR");
	});

	it("rejects when osascript cannot be spawned at all", async () => {
		spawnMock.mockImplementation(() => {
			const stream = () => Object.assign(new EventEmitter(), { setEncoding: () => undefined });
			const child = new EventEmitter() as FakeChild;
			child.stdout = stream();
			child.stderr = stream();
			child.stdin = { on: () => undefined, end: () => undefined };
			setTimeout(() => child.emit("error", new Error("spawn osascript ENOENT")), 0);
			return child;
		});
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		await expect(bridge.archive("iCloud", "id-1")).rejects.toThrow(/nicht startbar/);
	});

	it("explains a missing archive mailbox with account name and Gmail hint", async () => {
		spawnMock.mockImplementation(spawnWith("no-mailbox\n"));
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
		spawnMock.mockImplementation(spawnWith("ok"));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");

		await bridge.archive("Privat Gmail", "id-1");

		const script = scriptOf();
		expect(script).toContain("lukitArchiveBox");
		expect(script).not.toContain("byName");
		expect(script).toContain("all mail");
	});

	it("reports a true/false inbox membership from the script output", async () => {
		spawnMock.mockImplementation(spawnWith("false\n"));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		expect(await bridge.isInInbox("iCloud", "id-1")).toBe(false);
	});

	it("throws lukit-not-found when the body script reports the message is gone", async () => {
		spawnMock.mockImplementation(spawnWith(JSON.stringify({ notFound: true })));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		await expect(bridge.fetchBody("iCloud", "id-1")).rejects.toThrow(/lukit-not-found/);
	});

	it("returns body and attachments on a successful fetch", async () => {
		spawnMock.mockImplementation(spawnWith(JSON.stringify({ body: "hi", attachments: [] })));
		const bridge = createOsascriptBridge({}, "Archive", {}, "Sent");
		expect(await bridge.fetchBody("iCloud", "id-1")).toEqual({ body: "hi", attachments: [] });
	});

	it("derives getSelection direction from the mailbox name (locale-agnostic)", async () => {
		spawnMock.mockImplementation(
			spawnWith(
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
