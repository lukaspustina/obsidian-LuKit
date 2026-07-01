import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta, ThreadMessage, SelectedMessage } from "../../src/features/email-filing/mail-bridge";
import { threadKey } from "../../src/features/email-filing/email-format-engine";
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
		listSentForThread: vi.fn(async () => []),
		getSelection: vi.fn(async () => []),
		...overrides,
	};
}

const RAW: RawMailMessageMeta = {
	id: "m@1",
	accountName: "iCloud",
	senderName: "Alice",
	senderAddress: "alice@example.com",
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
	walkCandidates: string[];
	suggestionsFor: (m: RawMailMessageMeta) => string[];
	skippedThreads: Set<string>;
	beginSelectedWalk: () => Promise<void>;
	captureSelectedThread: (m: SelectedMessage, editedBody: string, editedAttachments: unknown[], vorgang: unknown) => Promise<void>;
	buildRoutingCorpus: () => Promise<unknown[]>;
	routingCorpus: unknown[];
	suggestionsForTitle: (title: string) => string[];
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

	it("auto-skips a same-thread message (before fetching) once its thread was skipped", async () => {
		const fetchBody = vi.fn(async () => ({ body: "x", attachments: [] }));
		const { internals } = setup(fakeBridge({ fetchBody }));
		internals.skippedThreads.add("quartalsbericht");

		await internals.presentMessageAsync([{ ...RAW, subject: "AW: Quartalsbericht" }], 0);

		expect(fetchBody).not.toHaveBeenCalled();
		expect(lastNotice()).toContain("automatisch übersprungen");
	});

	it("learns within the walk: a Vorgang filed earlier is suggested for a same-thread email", async () => {
		const { app, internals } = setup(fakeBridge());
		const vorgang = createMockTFile("Vorgänge/Müller GmbH.md");
		app.vault.register(vorgang, "# Inhalt\n");
		// Candidate name does NOT match the subject, so name-match alone would not surface it.
		internals.walkCandidates = ["Müller GmbH", "Schmidt AG"];

		const first = { ...RAW, subject: "Quartalsbericht", senderName: "Alice" };
		await internals.fileEmailIntoVorgang(first, "body", [], vorgang);

		const followUp = { ...RAW, id: "b", subject: "AW: Quartalsbericht", senderName: "Alice" };
		expect(internals.suggestionsFor(followUp)).toContain("Müller GmbH");
	});
});

describe("EmailFilingFeature.fileEmailIntoVorgang — thread assembly (Phase 1)", () => {
	const reply = (overrides: Partial<ThreadMessage> = {}): ThreadMessage => ({
		id: "m@2",
		direction: "out",
		partyName: "Lukas",
		dateSent: "2026-06-30T11:00:00Z",
		body: "Meine Antwort",
		subject: "AW: Angebot",
		attachments: [],
		...overrides,
	});

	it("assembles inbound + Sent reply in date order", async () => {
		const { app, vorgang, internals } = setup(
			fakeBridge({ listSentForThread: vi.fn(async () => [reply()]) }),
		);
		await internals.fileEmailIntoVorgang(RAW, "Eingehender Text", [], vorgang);
		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Eingehender Text");
		expect(updated).toContain("Meine Antwort");
		expect(updated.indexOf("Eingehender Text")).toBeLessThan(updated.indexOf("Meine Antwort"));
	});

	it("files inbound-only and notices when Sent retrieval fails", async () => {
		const { app, vorgang, internals } = setup(
			fakeBridge({ listSentForThread: vi.fn(async () => { throw new Error("jxa"); }) }),
		);
		await internals.fileEmailIntoVorgang(RAW, "Eingehender Text", [], vorgang);
		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Eingehender Text");
		expect(noticeMessages().some((m) => m.includes("Gesendete Nachrichten"))).toBe(true);
	});

	it("excludes a Sent message whose thread does not match", async () => {
		const { app, vorgang, internals } = setup(
			fakeBridge({ listSentForThread: vi.fn(async () => [reply({ id: "m@9", subject: "Rechnung", body: "Anderes" })]) }),
		);
		await internals.fileEmailIntoVorgang(RAW, "Eingehender Text", [], vorgang);
		expect(app.vault.files.get(vorgang.path) ?? "").not.toContain("Anderes");
	});

	it("does not re-add a message already linked in the target Vorgang", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		app.vault.files.set(vorgang.path, "# Inhalt\n- siehe [x](message://%3Cm@1%3E)\n");
		await internals.fileEmailIntoVorgang(RAW, "Eingehender Text", [], vorgang);
		expect(lastNotice()).toContain("bereits abgelegt");
	});

	it("records the threadKey so the thread auto-skips after filing", async () => {
		const { vorgang, internals } = setup(fakeBridge());
		await internals.fileEmailIntoVorgang(RAW, "Text", [], vorgang);
		expect(internals.skippedThreads.has(threadKey("Angebot"))).toBe(true);
	});
});

describe("EmailFilingFeature — single-shot 'File selected Mail message' (Phase 2)", () => {
	const SEL_OUT: SelectedMessage = {
		id: "s@1",
		accountName: "iCloud",
		direction: "out",
		subject: "Angebot",
		partyName: "Bob",
		partyAddress: "bob@example.com",
		dateSent: "2026-07-01T09:00:00Z",
		body: "Mein Vorschlag",
		attachments: [],
	};

	it("notices and stops when nothing is selected", async () => {
		const { internals } = setup(fakeBridge({ getSelection: vi.fn(async () => []) }));
		await internals.beginSelectedWalk();
		expect(lastNotice()).toContain("Keine Nachricht");
	});

	it("captures an outbound selection into the Vorgang without archiving", async () => {
		const archive = vi.fn(async () => undefined);
		const { app, vorgang, internals } = setup(fakeBridge({ archive }));
		await internals.captureSelectedThread(SEL_OUT, "Mein Vorschlag", [], vorgang);
		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Mein Vorschlag");
		expect(archive).not.toHaveBeenCalled();
		expect(app.vault.modify).toHaveBeenCalled();
	});

	it("does not archive an inbound selection either (capture-only)", async () => {
		const archive = vi.fn(async () => undefined);
		const { vorgang, internals } = setup(fakeBridge({ archive }));
		const inboundSel: SelectedMessage = { ...SEL_OUT, id: "s@2", direction: "in", partyName: "Alice", partyAddress: "alice@example.com", body: "Eingehend" };
		await internals.captureSelectedThread(inboundSel, "Eingehend", [], vorgang);
		expect(archive).not.toHaveBeenCalled();
	});

	it("does not duplicate a selection already linked in the Vorgang", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		app.vault.files.set(vorgang.path, "# Inhalt\n- siehe [x](message://%3Cs@1%3E)\n");
		await internals.captureSelectedThread(SEL_OUT, "Mein Vorschlag", [], vorgang);
		expect(lastNotice()).toContain("bereits abgelegt");
	});
});

describe("EmailFilingFeature — cross-session routing (Phase 3)", () => {
	it("suggests a Vorgang mined from a prior filing, even without name-match", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Müller GmbH.md", { basename: "Müller GmbH" });
		app.vault.register(vorgang, "##### E-Mail von Alice: Angebot, 01.06.2026\n- siehe [x](message://%3Cm1%3E)\n");
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new EmailFilingFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;
		internals.walkCandidates = ["Müller GmbH", "Schmidt AG"];

		internals.routingCorpus = await internals.buildRoutingCorpus();
		// Name-match of "Müller GmbH" against "Angebot Alice" is 0; only the mined
		// corpus can surface it.
		expect(internals.suggestionsForTitle("Angebot Alice")).toContain("Müller GmbH");
	});
});
