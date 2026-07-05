import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, SelectedMessage } from "../../src/features/email-filing/mail-bridge";
import { buildMessageUrl, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// Local fakeBridge base (mirrors tests/acceptance/email-filing-feature.test.ts,
// extended with the saveAttachments double from the email-attachments SDD).
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

// Cast to reach the feature's private method at runtime (TS private is
// compile-time only) — same pattern as tests/acceptance/email-filing-feature.test.ts.
interface FeatureInternals {
	bridge: MailBridge;
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
	id: "m@7",
	accountName: "Privat",
	direction: "in",
	subject: "Angebot",
	partyName: "Alice",
	partyAddress: "alice@example.com",
	dateSent: "2026-06-30T10:00:00Z",
	body: "Body",
	attachments: [{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1234 }],
};

const MESSAGE: ThreadSectionMessage = {
	direction: "in",
	partyName: "Alice",
	dateSent: "2026-06-30T10:00:00Z",
	body: "Body",
	attachments: [{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1234 }],
	messageUrl: buildMessageUrl("m@7"),
};

const ASSEMBLED: AssembledThreadShape = {
	sectionName: "E-Mail-Thread: Angebot",
	messages: [MESSAGE],
	siblingIds: [],
	latestDate: new Date(2026, 5, 30),
	threadKey: "angebot",
};

beforeEach(() => resetNotices());

describe("SDD email-attachments p2 c6 — selected-command capture-only save", () => {
	it("saves the attachment, links it in the Vorgang, and never archives", async () => {
		const archive = vi.fn(async () => undefined);
		const saveAttachments = vi.fn(async () => ["rechnung.pdf"]);
		const { app, vorgang, internals } = setup(fakeBridge({ archive, saveAttachments }));

		await internals.commitSelectedThread(SELECTED, ASSEMBLED, [MESSAGE], vorgang);

		expect(saveAttachments).toHaveBeenCalled();
		const [accountName, messageId] = saveAttachments.mock.calls[0];
		expect(accountName).toBe("Privat");
		expect(messageId).toBe("m@7");

		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Anhänge: [[rechnung.pdf]]");

		expect(archive).not.toHaveBeenCalled();
	});
});
