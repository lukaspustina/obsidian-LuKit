// sanitizeSectionName (email-format-engine.ts) does not exist yet. Importing
// it fails module resolution until the implementer adds the export — that
// unresolved-import failure IS the correct RED state for this criterion,
// same as intake-engine.ts was before Phase 2 landed. The acceptance-style
// checks below additionally anticipate Phase 3's email-filing wiring (req.
// 9, 18-20), which is also not implemented yet — see
// sdd_vorgang-next-steps_p3_c10 for the commitThread signature this file
// shares.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import { sanitizeSectionName } from "../../src/features/email-filing/email-format-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
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

describe("sanitizeSectionName strips only link-breaking characters (SDD vorgang-next-steps p3 c11, req. 9a)", () => {
	it("removes ]], | and # but leaves a comma untouched", () => {
		const input = "Angebot]] extra | pipe # hash, and a comma";
		const result = sanitizeSectionName(input);

		expect(result).not.toContain("]]");
		expect(result).not.toContain("|");
		expect(result).not.toContain("#");
		expect(result).toContain(",");
	});
});

describe("email filing: h5 heading and intake anchor are sanitised identically (SDD vorgang-next-steps p3 c11)", () => {
	it("writes an identical sanitised value for the h5 heading and the intake anchor, and parses back correctly", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		const assembled = await internals.assembleThread(RAW, "Text", [], vorgang);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		const typedTitle = "Angebot]] mit | Pipe # Raute";
		const edited = { ...assembled, sectionName: typedTitle };
		await internals.commitThread(RAW, edited, assembled.messages, vorgang, ["Angebot pruefen"]);

		const updated = app.vault.files.get(vorgang.path) ?? "";
		const lines = updated.split("\n");
		const headingLine = lines.find((l) => l.startsWith("##### "));
		const anchorLine = lines.find((l) => l.startsWith("- Aus [[#"));

		expect(headingLine).toBeDefined();
		expect(anchorLine).toBeDefined();
		if (!headingLine || !anchorLine) return;

		const headingText = headingLine.slice("##### ".length);
		const anchorText = anchorLine.slice("- Aus [[#".length, -2); // strip trailing "]]"

		expect(anchorText).toBe(headingText);
		expect(headingText).not.toContain("]]");
		expect(headingText).not.toContain("|");
		expect(headingText).not.toContain("#");

		const groups = parseIntakeGroups(updated);
		expect(groups.length).toBe(1);
		// source is derived by extractWikilinkTarget (requirement 5a), whose regex
		// consumes the leading "#" — the full anchor lives in `line`, which is also
		// the mutation key. Corrected after the test commit.
		expect(groups[0].source).toBe(headingText);
	});
});
