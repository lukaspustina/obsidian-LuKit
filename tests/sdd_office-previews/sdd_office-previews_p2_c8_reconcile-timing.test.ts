import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

// Sources in lexicographic order; the injected shuffle returns them in descending order.
const MISSING_A = "A1.docx";
const STALE_B = "B2.docx";
const CURRENT_C = "C3.docx";
const MISSING_D = "D4.xlsx";
const CURRENT_E = "E5.docx";
const STALE_F = "F6.docx";

const ALL = [MISSING_A, STALE_B, CURRENT_C, MISSING_D, CURRENT_E, STALE_F];
const EVALUATION_ORDER = [...ALL].sort().reverse();
const TO_RENDER = [MISSING_A, STALE_B, MISSING_D, STALE_F];

const descendingShuffle = <T>(items: T[]): T[] => [...items].sort((a, b) => String(b).localeCompare(String(a)));

let h: Harness;

afterEach(() => {
	h?.dispose();
});

function seed(): void {
	for (const p of ALL) h.addSource(p, `content of ${p}`);
	h.putFile(h.mirror(CURRENT_C), markedPreview(CURRENT_C, sha256Of(`content of ${CURRENT_C}`)));
	h.putFile(h.mirror(CURRENT_E), markedPreview(CURRENT_E, sha256Of(`content of ${CURRENT_E}`)));
	h.putFile(h.mirror(STALE_B), markedPreview(STALE_B, sha256Of("older content")));
	h.putFile(h.mirror(STALE_F), markedPreview(STALE_F, sha256Of("older content")));
}

/** Source paths in the order of their first whole-file read (hashing = evaluation). */
function sourceReadOrder(): string[] {
	const seen: string[] = [];
	for (const c of h.adapterCalls) {
		if (c.op === "readBinary" && ALL.includes(c.path) && !seen.includes(c.path)) seen.push(c.path);
	}
	return seen;
}

describe("SDD office-previews p2 c8", () => {
	it("does not reconcile 119 s after layout ready", async () => {
		h = createHarness({ shuffle: descendingShuffle });
		seed();
		h.layoutReady();

		await h.advance(119_000);
		await h.settle();

		expect(sourceReadOrder()).toEqual([]);
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 0 });
	});

	it("queues only missing and stale sources once 120 s have elapsed", async () => {
		h = createHarness({ shuffle: descendingShuffle });
		seed();
		h.layoutReady();

		await h.advance(119_000);
		await h.advance(1_000);
		await h.settle();

		// Jitter has not elapsed yet, so nothing is rendered; the four sources that need a render are queued.
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toEqual({ current: 2, queued: 4, failed: 0 });

		await h.drain();

		expect([...h.renderer.renderedPaths()].sort()).toEqual([...TO_RENDER].sort());
		for (const p of TO_RENDER) {
			expect(h.previewMarker(p)).toEqual({ version: 1, sha256: sha256Of(`content of ${p}`) });
		}
	});

	it("evaluates the sources in the order produced by the injected shuffle", async () => {
		h = createHarness({ shuffle: descendingShuffle });
		seed();

		await h.start();

		expect(sourceReadOrder()).toEqual(EVALUATION_ORDER);
	});

	it("yields to a macrotask between files instead of evaluating all sources in one go", async () => {
		h = createHarness({ shuffle: descendingShuffle });
		seed();
		h.layoutReady();

		// Registered after the reconcile timer for the same instant, so it fires once the reconcile
		// has started: a reconcile that never yields would already have read every source by then.
		let readsAtProbe = -1;
		setTimeout(() => {
			readsAtProbe = sourceReadOrder().length;
		}, 120_000);

		await h.advance(120_000);
		await h.drain();

		expect(readsAtProbe).toBeGreaterThanOrEqual(0);
		expect(readsAtProbe).toBeLessThan(ALL.length);
		// The reconcile still completes: every source was evaluated.
		expect(sourceReadOrder()).toEqual(EVALUATION_ORDER);
	});
});
