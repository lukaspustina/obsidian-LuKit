import { describe, it, expect, vi } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import { buildMessageUrl, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";

// Self-contained local fakeBridge — mirrors tests/acceptance/email-filing-feature.test.ts's
// fakeBridge() but adds the saveAttachments double this SDD phase pins.
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
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	return { app, vorgang, internals };
}

describe("SDD email-attachments p2 c7", () => {
	it("makes no saveAttachments call, writes no Anhänge line, and never mkdirs for a message without attachments", async () => {
		const saveAttachments = vi.fn(async () => []);
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const msg: ThreadSectionMessage = {
			direction: "in",
			partyName: "Alice",
			dateSent: "2026-06-30T10:00:00Z",
			body: "Body",
			attachments: [],
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

		const content = app.vault.files.get(vorgang.path) ?? "";
		expect(content).not.toContain("Anhänge:");
		expect(saveAttachments).not.toHaveBeenCalled();
		expect(app.vault.adapter.mkdir).not.toHaveBeenCalled();
	});
});
