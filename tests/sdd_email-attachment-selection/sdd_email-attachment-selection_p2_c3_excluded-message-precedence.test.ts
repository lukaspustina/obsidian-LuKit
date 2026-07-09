import { describe, it, expect, vi } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import { buildMessageUrl, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import type { PreviewMessageResult } from "../../src/features/email-filing/email-preview-modal";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";

// Self-contained local fakeBridge — mirrors tests/sdd_email-attachments's fakeBridge().
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
		saveAttachments: vi.fn(async (_a: string, _m: string, items: { attachmentName: string }[]) =>
			items.map((i) => i.attachmentName),
		),
		...overrides,
	};
}

const RAW: RawMailMessageMeta = {
	id: "m@1",
	accountName: "iCloud",
	senderName: "Alice",
	senderAddress: "alice@example.com",
	subject: "Angebot",
	dateSent: "2026-07-01T10:00:00Z",
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
	applyPreviewResults: (
		messages: ThreadSectionMessage[],
		results: PreviewMessageResult[],
	) => ThreadSectionMessage[];
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

describe("SDD email-attachment-selection p2 c3", () => {
	it("drops all of an excluded message's attachments regardless of their checkboxes, while the included message is filed normally", async () => {
		const saveAttachments = vi.fn(async (_a: string, _m: string, items: { attachmentName: string }[]) =>
			items.map((i) => i.attachmentName),
		);
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		// msg1 (m@1, included): two attachments, one checked, one unchecked —
		// "processed normally" means its own checkbox filtering still applies.
		const msg1: ThreadSectionMessage = {
			direction: "in",
			partyName: "Alice",
			dateSent: "2026-07-01T10:00:00Z",
			body: "Body 1",
			attachments: [
				{ name: "vertrag.pdf", mimeType: "application/pdf", size: 40_000 },
				{ name: "logo.png", mimeType: "image/png", size: 40_000 },
			],
			messageUrl: buildMessageUrl("m@1"),
		};
		// msg2 (m@2, excluded): its one attachment is checked, but the message
		// itself is unchecked — exclusion must win regardless of the checkbox.
		const msg2: ThreadSectionMessage = {
			direction: "in",
			partyName: "Bob",
			dateSent: "2026-07-01T11:00:00Z",
			body: "Body 2",
			attachments: [{ name: "rechnung.pdf", mimeType: "application/pdf", size: 40_000 }],
			messageUrl: buildMessageUrl("m@2"),
		};

		const assembled: AssembledThreadShape = {
			sectionName: "E-Mail-Thread: Angebot",
			messages: [msg1, msg2],
			siblingIds: [],
			latestDate: new Date(2026, 6, 1),
			threadKey: "angebot",
		};

		const results: PreviewMessageResult[] = [
			{ included: true, body: "Body 1", attachmentsIncluded: [true, false] },
			{ included: false, body: "Body 2", attachmentsIncluded: [true] },
		];

		const contentMessages = internals.applyPreviewResults(assembled.messages, results);

		// The excluded message must not survive filtering at all.
		expect(contentMessages).toHaveLength(1);
		expect(contentMessages.some((m) => m.messageUrl === buildMessageUrl("m@2"))).toBe(false);
		// The included message's own attachment checkboxes must already be applied.
		expect(contentMessages[0].attachments.map((a) => a.name)).toEqual(["vertrag.pdf"]);

		await internals.commitThread(RAW, assembled, contentMessages, vorgang);

		expect(saveAttachments).toHaveBeenCalledTimes(1);
		expect(saveAttachments).not.toHaveBeenCalledWith(expect.anything(), "m@2", expect.anything());
		const items = saveAttachments.mock.calls[0][2] as { attachmentName: string }[];
		expect(items.map((i) => i.attachmentName)).toEqual(["vertrag.pdf"]);

		const content = app.vault.files.get(vorgang.path) ?? "";
		expect(content).toContain("Anhänge: [[vertrag.pdf]]");
		expect(content).not.toContain("logo.png");
		expect(content).not.toContain("rechnung.pdf");
	});
});
