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

describe("SDD email-attachment-selection p2 c1", () => {
	it("filters an unchecked attachment out of the save call and the Vorgang line", async () => {
		const saveAttachments = vi.fn(async (_a: string, _m: string, items: { attachmentName: string }[]) =>
			items.map((i) => i.attachmentName),
		);
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const msg: ThreadSectionMessage = {
			direction: "in",
			partyName: "Alice",
			dateSent: "2026-07-01T10:00:00Z",
			body: "Body",
			attachments: [
				{ name: "logo.png", mimeType: "image/png", size: 40_000 },
				{ name: "vertrag.pdf", mimeType: "application/pdf", size: 40_000 },
			],
			messageUrl: buildMessageUrl("m@1"),
		};
		const assembled: AssembledThreadShape = {
			sectionName: "E-Mail-Thread: Angebot",
			messages: [msg],
			siblingIds: [],
			latestDate: new Date(2026, 6, 1),
			threadKey: "angebot",
		};

		const results: PreviewMessageResult[] = [
			{ included: true, body: "Body", attachmentsIncluded: [false, true] },
		];

		const contentMessages = internals.applyPreviewResults(assembled.messages, results);
		await internals.commitThread(RAW, assembled, contentMessages, vorgang);

		expect(saveAttachments).toHaveBeenCalledTimes(1);
		const items = saveAttachments.mock.calls[0][2] as { attachmentName: string }[];
		expect(items).toHaveLength(1);
		expect(items.map((i) => i.attachmentName)).toEqual(["vertrag.pdf"]);
		expect(items.some((i) => i.attachmentName === "logo.png")).toBe(false);

		const content = app.vault.files.get(vorgang.path) ?? "";
		expect(content).toContain("Anhänge: [[vertrag.pdf]]");
		expect(content).not.toContain("logo.png");
	});
});
