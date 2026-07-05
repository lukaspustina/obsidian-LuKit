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

interface FeatureInternals {
	bridge: MailBridge;
	commitThread: (m: RawMailMessageMeta, assembled: AssembledThreadShape, contentMessages: ThreadSectionMessage[], vorgang: unknown) => Promise<void>;
}

function setup(bridge: MailBridge) {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
	app.vault.register(vorgang, "# Inhalt\n");
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	(feature as unknown as FeatureInternals).bridge = bridge;
	return { app, vorgang, feature, internals: feature as unknown as FeatureInternals };
}

function makeMessage(id: string): ThreadSectionMessage {
	return {
		direction: "in",
		partyName: "Alice",
		dateSent: "2026-06-30T10:00:00Z",
		body: "Body text",
		attachments: [{ name: "rechnung.pdf", mimeType: "application/pdf", size: 100 }],
		messageUrl: buildMessageUrl(id),
	};
}

beforeEach(() => resetNotices());

describe("SDD email-attachments p2 c3", () => {
	it("saves attachments only for the included message, never for the excluded one", async () => {
		const saveAttachments = vi.fn(async () => ["rechnung.pdf"]);
		const { vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const msg1 = makeMessage("m@1");
		const msg2 = makeMessage("m@2");
		const assembled: AssembledThreadShape = {
			sectionName: "Angebot, 30.06.2026",
			messages: [msg1, msg2],
			siblingIds: [],
			latestDate: new Date("2026-06-30T10:00:00Z"),
			threadKey: "angebot",
		};

		await internals.commitThread(RAW, assembled, [msg1], vorgang);

		expect(saveAttachments).toHaveBeenCalledTimes(1);
		expect(saveAttachments).toHaveBeenCalledWith("iCloud", "m@1", expect.anything());
		expect(saveAttachments).not.toHaveBeenCalledWith(expect.anything(), "m@2", expect.anything());
	});
});
