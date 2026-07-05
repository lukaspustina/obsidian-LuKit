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

// Casts to reach the feature's private methods at runtime (TS private is
// compile-time only) — same pattern as the besprechung/email acceptance tests.
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
	return { app, vorgang, internals: feature as unknown as FeatureInternals };
}

describe("SDD email-attachments p2 c5", () => {
	it("mixes wikilink and plain text when saveAttachments confirms only one of two attachments", async () => {
		const saveAttachments = vi.fn(async () => ["rechnung.pdf"]);
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const messageUrl = buildMessageUrl("m@1");
		const contentMessages: ThreadSectionMessage[] = [
			{
				direction: "in",
				dateSent: RAW.dateSent,
				partyName: "Alice",
				body: "Hallo",
				attachments: [
					{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1024 },
					{ name: "foto.jpg", mimeType: "image/jpeg", size: 2048 },
				],
				messageUrl,
			},
		];
		const assembled: AssembledThreadShape = {
			sectionName: "Angebot",
			messages: contentMessages,
			siblingIds: [],
			latestDate: new Date(RAW.dateSent),
			threadKey: "angebot",
		};

		await internals.commitThread(RAW, assembled, contentMessages, vorgang);

		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Anhänge: [[rechnung.pdf]], foto.jpg");
	});
});
