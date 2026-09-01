// Phase 3, criterion 12 (Test Scenarios #12):
// GIVEN a thread whose message ids are already filed in the target, WHEN it is
// filed again, THEN no second group appears (requirement 11: duplicate
// protection derived from the thread's filed message ids, not from the
// intake's own contents — requirement 12).
//
// Duplicate protection for emails is the existing assembleThread contract
// (returns null once every message id of the thread is already filed, as
// pinned by "does not re-add a message already linked in the target Vorgang"
// in email-filing-feature.test.ts) — that part already holds today. What does
// not exist yet is the group insertion itself (requirement 18/19's wiring into
// commitThread), so the first filing below is expected to leave exactly one
// group, which is the RED signal this file pins.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
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
	assembleThread: (m: RawMailMessageMeta, body: string, attachments: unknown[], vorgang: unknown) => Promise<AssembledThreadShape | null>;
	commitThread: (
		m: RawMailMessageMeta,
		assembled: AssembledThreadShape,
		contentMessages: ThreadSectionMessage[],
		vorgang: unknown,
		nextSteps: string[] | null,
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

describe("Email filing — re-filing an already-filed thread writes no second group (req 11, 12)", () => {
	it("keeps exactly one intake group after the thread is filed a second time", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());

		// First filing: the thread is new, so it is assembled and committed with
		// one next-steps item — this must leave exactly one intake group.
		const first = await internals.assembleThread(RAW, "Eingehender Text", [], vorgang);
		expect(first).not.toBeNull();
		if (!first) return;
		await internals.commitThread(RAW, first, first.messages, vorgang, ["Angebot prüfen"]);

		const afterFirst = app.vault.files.get(vorgang.path) ?? "";
		expect(parseIntakeGroups(afterFirst)).toHaveLength(1);

		// Second filing attempt of the same thread: every message id of the
		// thread ("m@1") is now already filed (embedded as a message:// link by
		// the first commit), so assembleThread must find nothing new.
		const second = await internals.assembleThread(RAW, "Andere Formulierung", [], vorgang);
		expect(second).toBeNull();
		expect(lastNotice()).toContain("bereits abgelegt");

		const afterSecond = app.vault.files.get(vorgang.path) ?? "";
		expect(parseIntakeGroups(afterSecond)).toHaveLength(1);
	});
});
