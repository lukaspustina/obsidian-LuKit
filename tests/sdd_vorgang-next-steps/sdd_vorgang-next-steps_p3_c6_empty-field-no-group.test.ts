// Phase 3, criterion 6 (Test Scenarios #6):
// GIVEN the email preview with an empty next-steps field, WHEN the user confirms
// without ⌘K, THEN no group is written.
//
// The next-steps textarea and the outcome's next-steps value do not exist yet
// (requirement 18) — referencing them is the intended RED state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailPreviewModal } from "../../src/features/email-filing/email-preview-modal";
import type { PreviewMessage, PreviewMessageResult, PreviewOutcome } from "../../src/features/email-filing/email-preview-modal";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { __fireEvent } from "../helpers/obsidian-stub";
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

const MESSAGES: PreviewMessage[] = [
	{ header: "30.06.2026 · Alice · eingehend", body: "Eingehender Text", attachments: [] },
];

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

// Recursively collects all stub elements of the contentEl tree (same helper as
// email-preview-outcome.test.ts).
function allEls(el: unknown): Record<string, unknown>[] {
	const node = el as { children?: unknown[] };
	const out: Record<string, unknown>[] = [el as Record<string, unknown>];
	for (const child of node.children ?? []) out.push(...allEls(child));
	return out;
}

function openModal(onConfirm: (results: PreviewMessageResult[], outcome: PreviewOutcome, nextSteps: string[] | null) => void) {
	const modal = new EmailPreviewModal(
		{} as never,
		"Vorgang - X",
		"Betreff: Angebot",
		"E-Mail-Thread: Angebot",
		MESSAGES,
		onConfirm as never,
		() => undefined,
	);
	modal.onOpen();
	const els = allEls((modal as unknown as { contentEl: unknown }).contentEl);
	const buttons = els.filter((e) => e.tag === "button");
	const buttonByText = (text: string) => buttons.find((b) => (b.texts as string[]).some((t) => t === text));
	const nextStepsInput = els.find((e) => e.tag === "textarea" && e.cls === "lukit-email-preview-next-steps") as
		| { value: string }
		| undefined;
	return { modal, buttonByText, nextStepsInput };
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

describe("Email preview — empty next-steps field, no ⌘K → no group (req 18, 19)", () => {
	it("renders an empty next-steps field and emits no next-steps value on confirm", () => {
		const onConfirm = vi.fn();
		const { buttonByText, nextStepsInput } = openModal(onConfirm);

		// Requirement 18: the field exists and is empty by default.
		expect(nextStepsInput).toBeDefined();
		expect(nextStepsInput?.value).toBe("");

		const ablegen = buttonByText("Ablegen");
		expect(ablegen).toBeDefined();
		__fireEvent(ablegen, "click");

		expect(onConfirm).toHaveBeenCalledTimes(1);
		const nextSteps = onConfirm.mock.calls[0][2] as string[] | null;
		expect(nextSteps).toBeNull();
	});

	it("writes no intake group when nextSteps is null", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		const assembled = await internals.assembleThread(RAW, "Eingehender Text", [], vorgang);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		await internals.commitThread(RAW, assembled, assembled.messages, vorgang, null);

		const content = app.vault.files.get(vorgang.path) ?? "";
		expect(parseIntakeGroups(content)).toHaveLength(0);
	});
});
