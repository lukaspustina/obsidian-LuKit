import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import { buildMessageUrl, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
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
		listInboxForThread: vi.fn(async () => []),
		getSelection: vi.fn(async () => []),
		detectSentMailboxes: vi.fn(async () => ({})),
		saveAttachments: vi.fn(async () => []),
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

interface AssembledThreadShape {
	sectionName: string;
	messages: ThreadSectionMessage[];
	siblingIds: string[];
	latestDate: Date;
	threadKey: string;
}

// Casts to reach the feature's private commitThread at runtime (TS private is
// compile-time only) — same pattern as email-filing-feature.test.ts.
interface FeatureInternals {
	bridge: MailBridge;
	commitThread: (
		m: RawMailMessageMeta,
		assembled: AssembledThreadShape,
		contentMessages: ThreadSectionMessage[],
		vorgang: unknown,
	) => Promise<void>;
}

function setup(bridge: MailBridge) {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
	app.vault.register(vorgang, "# Inhalt\n");
	const plugin = createMockPlugin(makeTestSettings({}), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	(feature as unknown as FeatureInternals).bridge = bridge;
	return { app, vorgang, internals: feature as unknown as FeatureInternals };
}

beforeEach(() => resetNotices());

describe("SDD email-attachments p2 c2", () => {
	it("passes saveAttachments an absolute destPath (getBasePath + vault-relative _resources + resolved filename)", async () => {
		const saveAttachments = vi.fn(async () => ["rechnung.pdf"]);
		const { vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const msg: ThreadSectionMessage = {
			direction: "in",
			partyName: "Alice",
			dateSent: "2026-06-30T10:00:00Z",
			body: "Hallo",
			attachments: [{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1024 }],
			messageUrl: buildMessageUrl("m@1"),
		};
		const assembled: AssembledThreadShape = {
			sectionName: "E-Mail-Thread: Angebot",
			messages: [msg],
			siblingIds: [],
			latestDate: new Date(2026, 5, 30),
			threadKey: "angebot",
		};

		await internals.commitThread(RAW, assembled, [msg], vorgang);

		expect(saveAttachments).toHaveBeenCalledTimes(1);
		const items = saveAttachments.mock.calls[0][2];
		expect(items[0].destPath).toBe("/vault/Vorgänge/_resources/rechnung.pdf");
		expect(items[0].attachmentName).toBe("rechnung.pdf");
	});
});
