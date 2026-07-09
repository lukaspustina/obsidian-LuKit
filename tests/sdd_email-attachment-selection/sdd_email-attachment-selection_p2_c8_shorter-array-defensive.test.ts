import { describe, it, expect } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import type { PreviewMessageResult } from "../../src/features/email-filing/email-preview-modal";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin } from "../helpers/obsidian-mocks";

// Internals cast: applyPreviewResults is a private method, reached the same
// way the acceptance tests reach other private feature methods.
interface FeatureInternals {
	applyPreviewResults: (
		messages: ThreadSectionMessage[],
		results: PreviewMessageResult[],
	) => ThreadSectionMessage[];
}

function setup(): FeatureInternals {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	return feature as unknown as FeatureInternals;
}

describe("SDD email-attachment-selection p2 c8 — attachmentsIncluded shorter than attachments (defensive)", () => {
	it("treats missing indices as deselected: first attachment kept, second dropped, no exception", () => {
		const internals = setup();

		const message: ThreadSectionMessage = {
			direction: "in",
			partyName: "Alice",
			dateSent: "2026-06-30T10:00:00Z",
			body: "Body text",
			attachments: [
				{ name: "a.pdf", mimeType: "application/pdf", size: 1000 },
				{ name: "b.pdf", mimeType: "application/pdf", size: 2000 },
			],
			messageUrl: "message://%3Cm@1%3E",
		};

		const results: PreviewMessageResult[] = [
			{ included: true, body: "Body text", attachmentsIncluded: [true] },
		];

		let out: ThreadSectionMessage[] = [];
		expect(() => {
			out = internals.applyPreviewResults([message], results);
		}).not.toThrow();

		expect(out).toHaveLength(1);
		expect(out[0].attachments.map((a) => a.name)).toEqual(["a.pdf"]);
	});
});
