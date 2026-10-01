import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

describe("SDD office-previews p2 c13", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("queues nothing while modify events keep arriving within the debounce window", async () => {
		h = createHarness();
		h.layoutReady();
		h.addSource("Docs/Angebot.docx", "v0");

		h.changeSource("Docs/Angebot.docx", "v1");
		await h.advance(2_000);
		h.changeSource("Docs/Angebot.docx", "v2");
		await h.advance(2_000);
		h.changeSource("Docs/Angebot.docx", "v3");

		// Almost the full debounce after the last event: still nothing queued.
		await h.advance(MODIFY_DEBOUNCE_MS - 1_000);
		expect((await h.status()).queued).toBe(0);
		expect(h.renderer.calls).toHaveLength(0);
	});

	it("queues exactly one job after three modify events on one path within 5 s", async () => {
		h = createHarness();
		h.layoutReady();
		h.addSource("Docs/Angebot.docx", "v0");

		h.changeSource("Docs/Angebot.docx", "v1");
		await h.advance(2_000);
		h.changeSource("Docs/Angebot.docx", "v2");
		await h.advance(2_000);
		h.changeSource("Docs/Angebot.docx", "v3");

		await h.advance(MODIFY_DEBOUNCE_MS + 1);
		expect((await h.status()).queued).toBe(1);
	});

	it("renders the source once for the coalesced events", async () => {
		h = createHarness();
		h.layoutReady();
		h.addSource("Docs/Angebot.docx", "v0");

		h.changeSource("Docs/Angebot.docx", "v1");
		await h.advance(1_000);
		h.changeSource("Docs/Angebot.docx", "v2");
		await h.advance(1_000);
		h.changeSource("Docs/Angebot.docx", "v3");

		await h.drain();

		expect(h.renderer.renderedPaths()).toEqual(["Docs/Angebot.docx"]);
		expect(h.previewMarker("Docs/Angebot.docx")).not.toBeNull();
	});
});
