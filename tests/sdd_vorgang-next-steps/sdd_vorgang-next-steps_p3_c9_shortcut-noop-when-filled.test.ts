// Phase 3, criterion 9 (Test Scenarios #9):
// GIVEN the email preview with two typed lines, WHEN the user also presses ⌘K
// and confirms, THEN exactly one group is written holding the two typed items,
// unaffected by ⌘K (requirement 19: "⌘K in that case is a no-op").
//
// Same not-yet-existing surface as criteria 6-8 (next-steps field, the
// triggerNextStepsPlaceholder hook standing in for the real ⌘K keybinding, and
// the group insertion wiring) — referencing them is the intended RED state.

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

interface ModalInternals {
	triggerNextStepsPlaceholder: () => void;
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

describe("Email preview — two typed lines plus ⌘K → shortcut is a no-op (req 19)", () => {
	it("still emits exactly the typed lines, not an empty placeholder, when ⌘K is also pressed", () => {
		const onConfirm = vi.fn();
		const { modal, buttonByText, nextStepsInput } = openModal(onConfirm);

		expect(nextStepsInput).toBeDefined();
		if (!nextStepsInput) return;
		nextStepsInput.value = "Angebot einholen\nRückmeldung geben";
		(modal as unknown as ModalInternals).triggerNextStepsPlaceholder();

		__fireEvent(buttonByText("Ablegen"), "click");

		expect(onConfirm).toHaveBeenCalledTimes(1);
		const nextSteps = onConfirm.mock.calls[0][2] as string[] | null;
		expect(nextSteps).toEqual(["Angebot einholen", "Rückmeldung geben"]);
	});

	it("inserts exactly one group holding the two typed items, not a second empty one", async () => {
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

		const expectedAnchor = formatVorgangHeadingText(assembled.sectionName, "de", assembled.latestDate);
		// The anchor is an IN-NOTE link and therefore carries the leading "#";
		// without it the wikilink points at a note that does not exist. Corrected
		// after the test commit — SDD requirements 9/9a and the sibling c10/c11
		// tests pin this form, this file originally omitted the "#".
		expect(groups[0].line).toBe(`- Aus [[#${expectedAnchor}]]`);
	});
});
