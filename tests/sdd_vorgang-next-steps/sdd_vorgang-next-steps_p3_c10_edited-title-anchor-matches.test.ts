// Phase 3 wiring (req. 9, 18-20) does not exist yet: EmailFilingFeature's
// commitThread neither sanitises the resolved section name nor writes an
// intake group for a filed email thread. The FeatureInternals.commitThread
// signature below anticipates that wiring (a trailing nextStepLines
// parameter, mirroring req. 18's "non-empty lines become the group's
// items") — today's implementation takes only four arguments, so the extra
// argument is inert (JS ignores surplus call arguments) and no intake group
// is ever written. The intake-anchor assertion therefore fails: the correct
// RED state for this criterion.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import { formatVorgangHeadingText } from "../../src/features/vorgang/vorgang-engine";
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
	assembleThread: (
		m: RawMailMessageMeta,
		body: string,
		attachments: unknown[],
		vorgang: unknown,
	) => Promise<AssembledThreadShape | null>;
	commitThread: (
		m: RawMailMessageMeta,
		assembled: AssembledThreadShape,
		contentMessages: ThreadSectionMessage[],
		vorgang: unknown,
		nextStepLines: string[],
	) => Promise<void>;
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

beforeEach(() => resetNotices());

describe("email filing: edited section title and the intake anchor stay in lockstep (SDD vorgang-next-steps p3 c10)", () => {
	it("writes an intake anchor that matches the edited h5 heading byte-for-byte", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		const assembled = await internals.assembleThread(RAW, "Eingehender Text", [], vorgang);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		const editedTitle = "Angebot Runde 2";
		const edited = { ...assembled, sectionName: editedTitle };
		await internals.commitThread(RAW, edited, assembled.messages, vorgang, ["Angebot pruefen"]);

		const updated = app.vault.files.get(vorgang.path) ?? "";
		const headingText = formatVorgangHeadingText(editedTitle, "de", assembled.latestDate);

		expect(updated).toContain(`##### ${headingText}`);
		expect(updated).toContain(`- Aus [[#${headingText}]]`);
	});
});
