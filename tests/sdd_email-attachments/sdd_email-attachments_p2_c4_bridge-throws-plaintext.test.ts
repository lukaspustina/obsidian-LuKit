import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

// Local fakeBridge — self-contained per Phase-2 test file convention. Includes
// the new saveAttachments double (present on the interface once Phase 1 lands;
// today's MailBridge type doesn't declare it yet, hence the cast below).
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
		saveAttachments: vi.fn(async () => {
			throw new Error("offline");
		}),
		...overrides,
	} as MailBridge;
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
// compile-time only) — same pattern as the other email-filing acceptance
// and SDD tests.
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

describe("SDD email-attachments p2 c4 — whole saveAttachments call throws, filing degrades to plaintext", () => {
	it("still writes the Vorgang with a plaintext attachments line and files successfully", async () => {
		const saveAttachments = vi.fn(async () => {
			throw new Error("offline");
		});
		const { app, vorgang, internals } = setup(fakeBridge({ saveAttachments }));

		const assembled = await internals.assembleThread(
			RAW,
			"Bitte pruefen",
			[{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1024 }],
			vorgang,
		);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		await internals.commitThread(RAW, assembled, assembled.messages, vorgang);

		expect(saveAttachments).toHaveBeenCalled();

		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Bitte pruefen");
		// Die Degradation betrifft die Anhänge-Zeile — der Vorgang selbst enthält
		// immer TOC-Wikilinks (- [[#…]]), daher nur die Zeile prüfen.
		const anhaengeLine = updated.split("\n").find((l) => l.includes("Anhänge:")) ?? "";
		expect(anhaengeLine).toContain("Anhänge: rechnung.pdf");
		expect(anhaengeLine).not.toContain("[[");
		expect(lastNotice()).toContain("Abgelegt");
	});
});
