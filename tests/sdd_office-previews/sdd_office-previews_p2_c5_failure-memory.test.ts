import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, type Harness } from "../helpers/office-previews-harness";
import { RECONCILE_DELAY_MS } from "../../src/features/office-previews/office-previews-engine";

const FAILURES_KEY = "lukit.officePreviews.failures";
const SOURCE = "Projekte/Angebot.docx";

describe("SDD office-previews p2 c5", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	function seededStorage(failureSha: string): Map<string, unknown> {
		const storage = new Map<string, unknown>();
		storage.set(FAILURES_KEY, {
			[SOURCE]: { sha256: failureSha, reason: "exit", at: "2026-10-01T10:00:00.000Z" },
		});
		return storage;
	}

	it("does not queue or render a source whose failure entry matches the current fingerprint", async () => {
		const content = "unchanged document content";
		h = createHarness({ storage: seededStorage(sha256Of(content)) });
		h.addSource(SOURCE, content);

		h.layoutReady();
		await h.advance(RECONCILE_DELAY_MS + 1_000);
		const afterReconcile = await h.status();
		await h.drain();

		expect(afterReconcile.queued).toBe(0);
		expect(afterReconcile.failed).toBe(1);
		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview(SOURCE)).toBeUndefined();
	});

	it("queues and renders a source whose content changed since the recorded failure", async () => {
		h = createHarness({ storage: seededStorage(sha256Of("old document content")) });
		h.addSource(SOURCE, "new document content");

		h.layoutReady();
		await h.advance(RECONCILE_DELAY_MS + 1_000);
		const afterReconcile = await h.status();
		await h.drain();

		expect(afterReconcile.queued).toBe(1);
		expect(h.renderer.renderedPaths()).toEqual([SOURCE]);
		expect(h.previewMarker(SOURCE)).toEqual({ version: 1, sha256: sha256Of("new document content") });
	});
});
