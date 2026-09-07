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
	resetNotices,
} from "../helpers/obsidian-mocks";

// Local fakeBridge — self-contained per the email-filing test convention.
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
	} as MailBridge;
}

const RAW: RawMailMessageMeta = {
	id: "m@1",
	accountName: "iCloud",
	senderName: "Erika Beispiel",
	senderAddress: "erika@example.com",
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
	resourcesFolderPathFor: (vorgang: unknown) => string;
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

function setup(notePath: string, bridge: MailBridge) {
	const app = createMockApp({});
	const vorgang = createMockTFile(notePath);
	// Obsidian populates .parent, and for a root-level note its path is "/" —
	// the shape that made a naive `${parent.path}/_resources` yield "//_resources".
	const idx = notePath.lastIndexOf("/");
	(vorgang as unknown as { parent: { path: string } }).parent = {
		path: idx === -1 ? "/" : notePath.slice(0, idx),
	};
	app.vault.register(vorgang, "# Inhalt\n");
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	(feature as unknown as FeatureInternals).bridge = bridge;
	return { app, vorgang, internals: feature as unknown as FeatureInternals };
}

beforeEach(() => resetNotices());

describe("_resources folder path", () => {
	it("puts a root-level Vorgang's resources in _resources, not //_resources", () => {
		const { vorgang, internals } = setup("Vorgang - X.md", fakeBridge());

		expect(internals.resourcesFolderPathFor(vorgang)).toBe("_resources");
	});

	it("puts a foldered Vorgang's resources next to the note", () => {
		const { vorgang, internals } = setup("Vorgänge/Vorgang - X.md", fakeBridge());

		expect(internals.resourcesFolderPathFor(vorgang)).toBe("Vorgänge/_resources");
	});
});

describe("saveThreadAttachments never throws", () => {
	// commitThread awaits saveThreadAttachments outside its own try, and by then
	// the email is already archived — a throw would strand it: out of the inbox
	// and never written to the Vorgang. Path building is the throwing candidate
	// (getBasePath on an adapter that is not a FileSystemAdapter).
	it("degrades to plaintext names and still files when destPath building throws", async () => {
		const saveAttachments = vi.fn(async () => []);
		const { app, vorgang, internals } = setup("Vorgänge/Vorgang - X.md", fakeBridge({ saveAttachments }));
		const adapter = app.vault.adapter as unknown as { getBasePath: () => string };
		adapter.getBasePath = () => {
			throw new Error("no filesystem adapter");
		};

		const assembled = await internals.assembleThread(
			RAW,
			"Bitte prüfen",
			[{ name: "rechnung.pdf", mimeType: "application/pdf", size: 1024 }],
			vorgang,
		);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		await expect(internals.commitThread(RAW, assembled, assembled.messages, vorgang)).resolves.toBeUndefined();

		expect(saveAttachments).not.toHaveBeenCalled();
		const updated = app.vault.files.get(vorgang.path) ?? "";
		expect(updated).toContain("Bitte prüfen");
		const anhaengeLine = updated.split("\n").find((l) => l.includes("Anhänge:")) ?? "";
		expect(anhaengeLine).toContain("Anhänge: rechnung.pdf");
		expect(anhaengeLine).not.toContain("[[");
	});
});
