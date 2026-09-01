// Not an SDD criterion — a gap the Phase 3 reviewer found. Two things are
// already covered separately: EmailPreviewModal emits the typed next-steps
// lines as onConfirm's third argument (p3_c7's first `it`), and
// EmailFilingFeature.commitThread writes an intake group when handed
// next-steps directly (p3_c7's second `it`, which calls commitThread by
// hand). Neither test exercises the closure inside
// EmailFilingFeature.presentMessageAsync that actually wires the two
// together: `(results, outcome, nextSteps) => { void this.commitThread(...,
// nextSteps); }`. TypeScript accepts a callback with fewer parameters than
// the type it's assigned to, so if that closure silently dropped `nextSteps`
// (e.g. `(results, outcome) => { void this.commitThread(..., null); }`), the
// type-check would stay clean and every SDD criterion above would still be
// green — only an end-to-end drive through the real feature callback catches
// it. This lives in tests/acceptance/ rather than tests/sdd_vorgang-next-steps/
// because it guards a wiring seam, not a documented SDD requirement, so it
// gets no p<N>_c<M> number.

import { describe, it, expect, vi, beforeEach } from "vitest";

// SectionNoteSuggestModal's own picking UI is irrelevant here — only its
// onPick callback (the feature's wiring) matters, so it is replaced with a
// recording stub, matching besprechung-suggestions.test.ts's pattern.
const { pickerOptions } = vi.hoisted(() => ({ pickerOptions: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/shared/modals/section-note-suggest", () => ({
	SectionNoteSuggestModal: class {
		constructor(_app: unknown, _tags: unknown, options: Record<string, unknown>) {
			pickerOptions.push(options);
		}
		open(): void {}
	},
}));

// EmailPreviewModal itself must run for real — that's the piece whose typed
// onConfirm signature is at risk of being silently narrowed at the call site.
// Only its instances are recorded, via a thin subclass over the real one, so
// the test can drive its real onOpen()/DOM/onConfirm behaviour.
const { previewModals } = vi.hoisted(() => ({ previewModals: [] as unknown[] }));
vi.mock("../../src/features/email-filing/email-preview-modal", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/features/email-filing/email-preview-modal")>();
	class RecordingEmailPreviewModal extends actual.EmailPreviewModal {
		constructor(...args: ConstructorParameters<typeof actual.EmailPreviewModal>) {
			super(...args);
			previewModals.push(this);
		}
	}
	return { ...actual, EmailPreviewModal: RecordingEmailPreviewModal };
});

import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, RawMailMessageMeta } from "../../src/features/email-filing/mail-bridge";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { __fireEvent } from "../helpers/obsidian-stub";
import { createMockApp, createMockTFile, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

function fakeBridge(overrides: Partial<MailBridge> = {}): MailBridge {
	return {
		listInbox: vi.fn(async () => []),
		listAccounts: vi.fn(async () => []),
		fetchBody: vi.fn(async () => ({ body: "Eingehender Text", attachments: [] })),
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

interface FeatureInternals {
	bridge: MailBridge;
	presentMessageAsync: (m: RawMailMessageMeta[], i: number) => Promise<void>;
}

function allEls(el: unknown): Record<string, unknown>[] {
	const node = el as { children?: unknown[] };
	const out: Record<string, unknown>[] = [el as Record<string, unknown>];
	for (const child of node.children ?? []) out.push(...allEls(child));
	return out;
}

// Flushes the microtask queue past a setTimeout(0) boundary — needed because
// the feature's onPick/onConfirm handlers chain several unawaited promises
// (`void this.assembleThread(...).then(...)`, `void this.commitThread(...)`).
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	resetNotices();
	pickerOptions.length = 0;
	previewModals.length = 0;
});

describe("EmailFilingFeature — the picker→preview→commit callback actually forwards nextSteps", () => {
	it("carries the typed next-steps lines from the real modal through the feature's own onConfirm closure into the written intake group", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
		app.vault.register(vorgang, "# Inhalt\n");
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new EmailFilingFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;
		internals.bridge = fakeBridge();

		await internals.presentMessageAsync([RAW], 0);
		expect(pickerOptions).toHaveLength(1);

		// Drive the picker's real onPick, exactly as choosing the target note would.
		(pickerOptions[0].onPick as (f: unknown) => void)(vorgang);
		await flush();

		expect(previewModals).toHaveLength(1);
		const modal = previewModals[0] as { onOpen: () => void; contentEl: unknown };
		modal.onOpen();

		const els = allEls(modal.contentEl);
		const nextStepsInput = els.find((e) => e.tag === "textarea" && e.cls === "lukit-email-preview-next-steps") as
			| { value: string }
			| undefined;
		expect(nextStepsInput).toBeDefined();
		if (!nextStepsInput) return;
		nextStepsInput.value = "Angebot einholen\nRückmeldung geben";

		const buttons = els.filter((e) => e.tag === "button");
		const confirmButton = buttons.find((b) => (b.texts as string[]).some((t) => t === "Ablegen"));
		expect(confirmButton).toBeDefined();
		__fireEvent(confirmButton, "click");
		await flush();

		const content = app.vault.files.get(vorgang.path) ?? "";
		const groups = parseIntakeGroups(content);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Angebot einholen", "Rückmeldung geben"]);
	});
});
