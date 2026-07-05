import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import { type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// Self-contained fakeBridge base (see tests/acceptance/email-filing-feature.test.ts
// for the shared shape) plus the saveAttachments double this SDD adds.
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
		saveAttachments: vi.fn(async () => ["rechnung.pdf"]),
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
// compile-time only) — same pattern as tests/acceptance/email-filing-feature.test.ts.
interface FeatureInternals {
	bridge: MailBridge;
	assembleThread: (m: RawMailMessageMeta, body: string, attachments: unknown[], vorgang: unknown) => Promise<AssembledThreadShape | null>;
	commitThread: (m: RawMailMessageMeta, assembled: AssembledThreadShape, contentMessages: ThreadSectionMessage[], vorgang: unknown) => Promise<void>;
}

function setup(bridge: MailBridge) {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
	// The feature derives the _resources folder from the target note's parent
	// folder; the TFile stub has no `parent` field by default, so it is added
	// here (matches the SDD's `targetFile.parent?.path` derivation).
	Object.assign(vorgang, { parent: { path: "Vorgänge" } });
	app.vault.register(vorgang, "# Inhalt\n");
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	(feature as unknown as FeatureInternals).bridge = bridge;
	return { app, vorgang, internals: feature as unknown as FeatureInternals };
}

beforeEach(() => resetNotices());

describe("SDD email-attachments p2 c8 — mkdir when _resources is missing", () => {
	it("creates the _resources folder before saving attachments, when it does not exist yet", async () => {
		const saveAttachments = vi.fn(async () => ["rechnung.pdf"]);
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		// adapter.folders starts empty — the _resources folder does not exist.
		expect(app.vault.adapter.folders.has("Vorgänge/_resources")).toBe(false);

		const attachment = { name: "rechnung.pdf", mimeType: "application/pdf", size: 100 };
		const assembled = await internals.assembleThread(RAW, "Body", [attachment], vorgang);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		await internals.commitThread(RAW, assembled, assembled.messages, vorgang);

		expect(app.vault.adapter.mkdir).toHaveBeenCalledWith("Vorgänge/_resources");
		expect(saveAttachments).toHaveBeenCalled();

		const mkdirOrder = (app.vault.adapter.mkdir as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
		const saveOrder = saveAttachments.mock.invocationCallOrder[0];
		expect(mkdirOrder).toBeLessThan(saveOrder);
	});
});
