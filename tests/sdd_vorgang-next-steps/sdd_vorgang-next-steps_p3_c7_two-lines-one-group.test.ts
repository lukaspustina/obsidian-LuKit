// Phase 3, criterion 7 (Test Scenarios #7):
// GIVEN the email preview with two typed lines, WHEN the user confirms without
// ⌘K, THEN one group with two items is written, anchored to the h5 section
// created by that filing (requirement 18, 9).
//
// The next-steps textarea and its wiring into group insertion do not exist yet
// — referencing them is the intended RED state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailPreviewModal } from "../../src/features/email-filing/email-preview-modal";
import type { PreviewMessage, PreviewMessageResult, PreviewOutcome } from "../../src/features/email-filing/email-preview-modal";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { formatVorgangHeadingText } from "../../src/features/vorgang/vorgang-engine";
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

describe("Email preview — two typed next-steps lines, no ⌘K → one group with two items (req 18, 9)", () => {
	it("emits the typed lines as the next-steps value on confirm", () => {
		const onConfirm = vi.fn();
		const { buttonByText, nextStepsInput } = openModal(onConfirm);

		expect(nextStepsInput).toBeDefined();
		if (!nextStepsInput) return;
		nextStepsInput.value = "Angebot einholen\nRückmeldung geben";

		__fireEvent(buttonByText("Ablegen"), "click");

		expect(onConfirm).toHaveBeenCalledTimes(1);
		const nextSteps = onConfirm.mock.calls[0][2] as string[] | null;
		expect(nextSteps).toEqual(["Angebot einholen", "Rückmeldung geben"]);
	});

	it("inserts exactly one group with both items, anchored to the created h5 section", async () => {
		const { app, vorgang, internals } = setup(fakeBridge());
		const assembled = await internals.assembleThread(RAW, "Eingehender Text", [], vorgang);
		expect(assembled).not.toBeNull();
		if (!assembled) return;

		const nextSteps = ["Angebot einholen", "Rückmeldung geben"];
		await internals.commitThread(RAW, assembled, assembled.messages, vorgang, nextSteps);

		const content = app.vault.files.get(vorgang.path) ?? "";
		const groups = parseIntakeGroups(content);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(nextSteps);
		expect(groups[0].foreignItems).toHaveLength(0);

		// Anchored to the h5 section that this same filing created (requirement 9).
		const expectedAnchor = formatVorgangHeadingText(assembled.sectionName, "de", assembled.latestDate);
		expect(groups[0].line).toBe(`- Aus [[${expectedAnchor}]]`);
		expect(content).toContain(`##### ${expectedAnchor}`);
	});
});
