import { describe, it, expect } from "vitest";
import { EmailFilingFeature } from "../../src/features/email-filing/email-filing-feature";
import type { MailBridge, ThreadSectionMessage } from "../../src/features/email-filing/email-format-engine";
import type { PreviewMessageResult } from "../../src/features/email-filing/email-preview-modal";
import { createMockApp, createMockPlugin, makeTestSettings, asLuKitPlugin } from "../helpers/obsidian-mocks";

// Internals cast to reach the feature's private applyPreviewResults method at
// runtime (TS private is compile-time only) — same pattern as the besprechung
// and email-filing acceptance tests.
interface FeatureInternals {
	applyPreviewResults: (
		thread: ThreadSectionMessage[],
		results: PreviewMessageResult[],
	) => ThreadSectionMessage[];
}

function fakeBridge(): MailBridge {
	return {
		listInbox: async () => [],
		listAccounts: async () => [],
		fetchBody: async () => ({ body: "", attachments: [] }),
		archive: async () => undefined,
		isInInbox: async () => false,
		listSentForThread: async () => [],
		listInboxForThread: async () => [],
		getSelection: async () => [],
		detectSentMailboxes: async () => ({}),
		saveAttachments: async () => [],
	};
}

function setup() {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new EmailFilingFeature();
	feature.onload(asLuKitPlugin(plugin));
	(feature as unknown as { bridge: MailBridge }).bridge = fakeBridge();
	return feature as unknown as FeatureInternals;
}

describe("SDD email-attachment-selection p2 c7 — duplicate attachment names, positional selection", () => {
	it("keeps only the second scan.pdf (size 200), matched by index not name", () => {
		const internals = setup();

		const message: ThreadSectionMessage = {
			direction: "in",
			partyName: "Carol",
			dateSent: "2026-06-30T09:00:00Z",
			body: "Zwei gleichnamige Anhänge",
			attachments: [
				{ name: "scan.pdf", mimeType: "application/pdf", size: 100 },
				{ name: "scan.pdf", mimeType: "application/pdf", size: 200 },
			],
			messageUrl: "message://%3Cm@1%3E",
		};

		const result: PreviewMessageResult = {
			included: true,
			body: message.body,
			attachmentsIncluded: [false, true],
		};

		const [filed] = internals.applyPreviewResults([message], [result]);

		expect(filed.attachments).toHaveLength(1);
		expect(filed.attachments[0].size).toBe(200);
	});
});
