import { describe, it, expect } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import type { PreviewMessageResult } from "../../src/features/email-filing/email-preview-modal";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin } from "../helpers/obsidian-mocks";

// Cast to reach the feature's private applyPreviewResults at runtime (TS
// private is compile-time only) — same pattern as the other email-filing
// acceptance tests.
interface FeatureInternals {
	applyPreviewResults: (
		messages: ThreadSectionMessage[],
		results: PreviewMessageResult[],
	) => ThreadSectionMessage[];
}

function setupFeature(): FeatureInternals {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	return feature as unknown as FeatureInternals;
}

function messageWithOneAttachment(): ThreadSectionMessage {
	return {
		direction: "in",
		partyName: "Alice",
		dateSent: "2026-06-30T10:00:00Z",
		body: "Hallo",
		attachments: [{ name: "a.pdf", mimeType: "application/pdf", size: 100 }],
		messageUrl: "message://%3Cm@1%3E",
	};
}

describe("SDD email-attachment-selection p2 c9 — attachmentsIncluded longer than attachments (defensive)", () => {
	it("ignores the surplus entry and keeps exactly the one checked attachment", () => {
		const internals = setupFeature();
		const messages = [messageWithOneAttachment()];
		const results: PreviewMessageResult[] = [
			{ included: true, body: "Hallo", attachmentsIncluded: [true, true, false] },
		];

		let out: ThreadSectionMessage[] = [];
		expect(() => {
			out = internals.applyPreviewResults(messages, results);
		}).not.toThrow();

		expect(out).toHaveLength(1);
		expect(out[0].attachments).toHaveLength(1);
		expect(out[0].attachments[0].name).toBe("a.pdf");
	});

	it("drops the attachment when its own index is unchecked, ignoring the surplus entry", () => {
		const internals = setupFeature();
		const messages = [messageWithOneAttachment()];
		const results: PreviewMessageResult[] = [
			{ included: true, body: "Hallo", attachmentsIncluded: [false, true] },
		];

		let out: ThreadSectionMessage[] = [];
		expect(() => {
			out = internals.applyPreviewResults(messages, results);
		}).not.toThrow();

		expect(out).toHaveLength(1);
		expect(out[0].attachments).toHaveLength(0);
	});
});
