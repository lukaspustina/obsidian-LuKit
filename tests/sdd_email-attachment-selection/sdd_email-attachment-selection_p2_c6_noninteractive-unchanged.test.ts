import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { MailAttachment } from "../../src/features/email-filing/email-format-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// Self-contained local fakeBridge — mirrors tests/sdd_email-attachments' fakeBridge() pattern.
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
	dateSent: "2026-06-30T10:00:00Z",
};

interface FeatureInternals {
	bridge: MailBridge;
	fileEmailIntoVorgang: (
		m: RawMailMessageMeta,
		body: string,
		attachments: MailAttachment[],
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

beforeEach(() => resetNotices());

describe("SDD email-attachment-selection p2 c6", () => {
	it("keeps both attachments on the non-interactive fileEmailIntoVorgang path — no preselection without UI", async () => {
		const saveAttachments = vi.fn(async (_a: string, _m: string, items: { attachmentName: string }[]) =>
			items.map((i) => i.attachmentName),
		);
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const attachments: MailAttachment[] = [
			{ name: "logo.png", mimeType: "image/png", size: 40_000 },
			{ name: "vertrag.pdf", mimeType: "application/pdf", size: 40_000 },
		];

		await internals.fileEmailIntoVorgang(RAW, "Body text", attachments, vorgang);

		expect(saveAttachments).toHaveBeenCalledTimes(1);
		const savedItems = saveAttachments.mock.calls[0][2] as { attachmentName: string }[];
		const savedNames = savedItems.map((i) => i.attachmentName);
		expect(savedNames).toContain("logo.png");
		expect(savedNames).toContain("vertrag.pdf");

		const content = app.vault.files.get(vorgang.path) ?? "";
		expect(content).toContain("[[logo.png]]");
		expect(content).toContain("[[vertrag.pdf]]");
	});
});
