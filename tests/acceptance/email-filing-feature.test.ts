import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	noticeMessages,
	resetNotices,
} from "../helpers/obsidian-mocks";

function fakeBridge(overrides: Partial<MailBridge> = {}): MailBridge {
	return {
		listInbox: vi.fn(async () => []),
		listAccounts: vi.fn(async () => []),
		fetchBody: vi.fn(async () => ({ body: "", attachments: [] })),
		archive: vi.fn(async () => undefined),
		isInInbox: vi.fn(async () => false),
		...overrides,
	};
}

const RAW: RawMailMessageMeta = {
	id: "m@1",
	accountName: "iCloud",
	senderName: "Alice",
	subject: "Angebot",
	dateSent: "2026-06-30T10:00:00Z",
};

// Casts to reach the feature's private methods at runtime (TS private is
// compile-time only) — same pattern as the besprechung acceptance tests.
interface FeatureInternals {
	bridge: MailBridge;
	openUrl: (url: string) => void;
	startWalk: () => void;
	beginWalk: () => Promise<void>;
	orderMessages: (m: RawMailMessageMeta[]) => RawMailMessageMeta[];
	selectWalkMessages: (m: RawMailMessageMeta[]) => RawMailMessageMeta[];
	fileEmailIntoVorgang: (m: RawMailMessageMeta, body: string, attachments: unknown[], vorgang: unknown) => Promise<void>;
	archiveOnly: (m: RawMailMessageMeta) => Promise<void>;
	openMessage: (meta: { messageUrl: string }) => void;
	presentMessageAsync: (m: RawMailMessageMeta[], i: number) => Promise<void>;
}

function setup(bridge: MailBridge, overrides: Parameters<typeof makeTestSettings>[0] = {}) {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
	app.vault.register(vorgang, "# Inhalt\n");
	const plugin = createMockPlugin(makeTestSettings(overrides), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	(feature as unknown as FeatureInternals).bridge = bridge;
	return { app, vorgang, feature, internals: feature as unknown as FeatureInternals };
}

beforeEach(() => resetNotices());

describe("EmailFilingFeature.fileEmailIntoVorgang — archive-first contract", () => {
	it("archives, verifies, then inserts the section into the Vorgang", async () => {
		const archive = vi.fn(async () => undefined);
		const isInInbox = vi.fn(async () => false);
		const { app, vorgang, internals } = setup(fakeBridge({ archive, isInInbox }));

		await internals.fileEmailIntoVorgang(RAW, "Body text", [], vorgang);

		expect(archive).toHaveBeenCalledWith("iCloud", "m@1");
		expect(isInInbox).toHaveBeenCalledWith("iCloud", "m@1");
		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("E-Mail von Alice: Angebot");
		expect(updated).toContain("Body text");
		expect(lastNotice()).toContain("Abgelegt");
	});

	it("does not modify the Vorgang and reports subject + link when archive throws", async () => {
		const { app, vorgang, internals } = setup(
			fakeBridge({ archive: vi.fn(async () => { throw new Error("imap"); }) }),
		);

		await internals.fileEmailIntoVorgang(RAW, "Body", [], vorgang);

		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(lastNotice()).toContain("Angebot");
		expect(lastNotice()).toContain("message://");
	});

	it("does not modify the Vorgang when the message is still in the inbox after archive", async () => {
		const { app, vorgang, internals } = setup(fakeBridge({ isInInbox: vi.fn(async () => true) }));

		await internals.fileEmailIntoVorgang(RAW, "Body", [], vorgang);

		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(lastNotice()).toContain("nicht aus dem Posteingang");
	});

	it("reports a partial-state Notice when vault.modify fails after a successful archive", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		app.vault.modify = vi.fn(async () => { throw new Error("disk full"); });

		await internals.fileEmailIntoVorgang(RAW, "Body", [], vorgang);

		expect(lastNotice()).toContain("Archiviert, aber nicht");
		expect(lastNotice()).toContain("Vorgang - X");
	});
});

describe("EmailFilingFeature — other actions", () => {
	it("archiveOnly archives without modifying any note", async () => {
		const archive = vi.fn(async () => undefined);
		const { app, internals } = setup(fakeBridge({ archive }));

		await internals.archiveOnly(RAW);

		expect(archive).toHaveBeenCalledWith("iCloud", "m@1");
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(lastNotice()).toContain("Archiviert (nicht abgelegt)");
	});

	it("orderMessages reverses to newest-first when configured", () => {
		const { internals } = setup(fakeBridge(), { emailFiling: { order: "newest", defaultArchiveMailbox: "Archive", archiveMailboxes: {}, walkAccounts: {} } });
		const older = { ...RAW, id: "old" };
		const newer = { ...RAW, id: "new" };
		expect(internals.orderMessages([older, newer]).map((m) => m.id)).toEqual(["new", "old"]);
	});

	it("selectWalkMessages keeps only included accounts, in order", () => {
		const { internals } = setup(fakeBridge(), {
			emailFiling: { order: "oldest", defaultArchiveMailbox: "Archive", archiveMailboxes: {}, walkAccounts: { Gmail: false } },
		});
		const a = { ...RAW, id: "a", accountName: "iCloud" };
		const b = { ...RAW, id: "b", accountName: "Gmail" };
		const c = { ...RAW, id: "c", accountName: "iCloud" };
		expect(internals.selectWalkMessages([a, b, c]).map((m) => m.id)).toEqual(["a", "c"]);
	});

	it("openMessage opens the pre-built message:// URL", () => {
		const opened: string[] = [];
		const { internals } = setup(fakeBridge());
		internals.openUrl = (url) => opened.push(url);
		internals.openMessage({ messageUrl: "message://x%40y" });
		expect(opened).toEqual(["message://x%40y"]);
	});

	it("rejects a concurrent walk while one is in progress", () => {
		const { internals } = setup(
			fakeBridge({ listInbox: vi.fn(() => new Promise(() => undefined)) }),
		);
		internals.startWalk(); // sets the guard, awaits listInbox forever
		internals.startWalk(); // second invocation in the same tick
		expect(lastNotice()).toContain("läuft bereits");
	});

	it("reports an empty inbox and stops", async () => {
		const { internals } = setup(fakeBridge({ listInbox: vi.fn(async () => []) }));
		await internals.beginWalk();
		expect(lastNotice()).toContain("Inbox ist leer");
	});

	it("skips a vanished message silently and summarizes it at walk end", async () => {
		const { internals } = setup(
			fakeBridge({ fetchBody: vi.fn(async () => { throw new Error("lukit-not-found"); }) }),
		);
		await internals.presentMessageAsync([RAW], 0);
		expect(lastNotice()).toContain("nicht mehr im Posteingang");
		// No per-message Notice leaked the subject.
		expect(noticeMessages().some((m) => m.includes("Angebot"))).toBe(false);
	});

	it("stops the walk on a Mail permission error (-1743)", async () => {
		const { internals } = setup(
			fakeBridge({ fetchBody: vi.fn(async () => { throw new Error("Mail nicht erreichbar (-1743)"); }) }),
		);
		await internals.presentMessageAsync([RAW, { ...RAW, id: "b" }], 0);
		expect(lastNotice()).toContain("-1743");
	});

	it("skips an unreadable message and continues the walk", async () => {
		const { internals } = setup(
			fakeBridge({ fetchBody: vi.fn(async () => { throw new Error("AppleEvent handler failed (-10000)"); }) }),
		);
		await internals.presentMessageAsync([RAW], 0);
		expect(lastNotice()).toContain("nicht ladbar");
	});
});
