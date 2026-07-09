import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, SelectedMessage } from "../../src/features/email-filing/mail-bridge";
import { buildMessageUrl, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import type { PreviewMessageResult } from "../../src/features/email-filing/email-preview-modal";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// Local fakeBridge base (mirrors tests/sdd_email-attachments/..._selected-capture-saves.test.ts),
// extended with the saveAttachments double.
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

interface AssembledThreadShape {
	sectionName: string;
	messages: ThreadSectionMessage[];
	siblingIds: string[];
	latestDate: Date;
	threadKey: string;
}

// Cast to reach the feature's private methods at runtime (TS private is
// compile-time only) — same pattern as the sibling c6 test.
interface FeatureInternals {
	bridge: MailBridge;
	applyPreviewResults: (
		messages: ThreadSectionMessage[],
		results: PreviewMessageResult[],
	) => ThreadSectionMessage[];
	commitSelectedThread: (
		m: SelectedMessage,
		assembled: AssembledThreadShape,
		contentMessages: ThreadSectionMessage[],
		vorgang: unknown,
	) => Promise<void>;
}

function setup(bridge: MailBridge) {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
	(vorgang as unknown as { parent: { path: string } }).parent = { path: "Vorgänge" };
	app.vault.register(vorgang, "# Inhalt\n");
	const plugin = createMockPlugin(makeTestSettings({}), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;
	internals.bridge = bridge;
	return { app, vorgang, internals };
}

const SELECTED: SelectedMessage = {
	id: "m@9",
	accountName: "Privat",
	direction: "in",
	subject: "Vertrag",
	partyName: "Alice",
	partyAddress: "alice@example.com",
	dateSent: "2026-06-30T10:00:00Z",
	body: "Body",
	attachments: [
		{ name: "logo.png", mimeType: "image/png", size: 40_000 },
		{ name: "vertrag.pdf", mimeType: "application/pdf", size: 12_345 },
	],
};

const MESSAGE: ThreadSectionMessage = {
	direction: "in",
	partyName: "Alice",
	dateSent: "2026-06-30T10:00:00Z",
	body: "Body",
	attachments: [
		{ name: "logo.png", mimeType: "image/png", size: 40_000 },
		{ name: "vertrag.pdf", mimeType: "application/pdf", size: 12_345 },
	],
	messageUrl: buildMessageUrl("m@9"),
};

const ASSEMBLED: AssembledThreadShape = {
	sectionName: "E-Mail-Thread: Vertrag",
	messages: [MESSAGE],
	siblingIds: [],
	latestDate: new Date(2026, 5, 30),
	threadKey: "vertrag",
};

beforeEach(() => resetNotices());

describe("SDD email-attachment-selection p2 c5 — selected-command attachment filter", () => {
	it("saves only the checked attachment, links only it, and never archives", async () => {
		const archive = vi.fn(async () => undefined);
		const saveAttachments = vi.fn(async () => ["vertrag.pdf"]);
		const { app, vorgang, internals } = setup(fakeBridge({ archive, saveAttachments }));

		const results: PreviewMessageResult[] = [
			{ included: true, body: MESSAGE.body, attachmentsIncluded: [false, true] },
		];
		const contentMessages = internals.applyPreviewResults(ASSEMBLED.messages, results);

		await internals.commitSelectedThread(SELECTED, ASSEMBLED, contentMessages, vorgang);

		expect(saveAttachments).toHaveBeenCalledTimes(1);
		const [, , savedItems] = saveAttachments.mock.calls[0];
		const savedNames = (savedItems as { attachmentName: string }[]).map((a) => a.attachmentName);
		expect(savedNames).toEqual(["vertrag.pdf"]);
		expect(savedNames).not.toContain("logo.png");

		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Anhänge: [[vertrag.pdf]]");
		expect(updated).not.toContain("logo.png");

		expect(archive).not.toHaveBeenCalled();
	});
});
