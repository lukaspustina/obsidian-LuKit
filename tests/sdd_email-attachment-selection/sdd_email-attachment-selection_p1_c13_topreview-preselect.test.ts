import { describe, it, expect } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import { buildMessageUrl, type ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import type { PreviewMessage } from "../../src/features/email-filing/email-preview-modal";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin } from "../helpers/obsidian-mocks";

// Reaches the feature's private toPreviewMessages at runtime (TS private is
// compile-time only) — same cast pattern as tests/acceptance/email-filing-feature.test.ts.
interface FeatureInternals {
	toPreviewMessages: (thread: ThreadSectionMessage[]) => PreviewMessage[];
}

function setup() {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	return feature as unknown as FeatureInternals;
}

describe("SDD email-attachment-selection p1 c13 — toPreviewMessages preselect", () => {
	it("carries per-attachment preselect flags in order (image below threshold, document)", () => {
		const internals = setup();
		const thread: ThreadSectionMessage[] = [
			{
				direction: "in",
				partyName: "Alice",
				dateSent: "2026-07-01T10:00:00Z",
				body: "Body",
				attachments: [
					{ name: "logo.png", mimeType: "image/png", size: 40_000 },
					{ name: "vertrag.pdf", mimeType: "application/pdf", size: 40_000 },
				],
				messageUrl: buildMessageUrl("m@1"),
			},
		];

		const [preview] = internals.toPreviewMessages(thread);

		expect(preview.attachments).toEqual([
			{ name: "logo.png", preselected: false },
			{ name: "vertrag.pdf", preselected: true },
		]);
	});
});
