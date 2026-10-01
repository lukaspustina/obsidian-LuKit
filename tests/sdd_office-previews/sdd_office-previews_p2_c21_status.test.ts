import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";
import { MODIFY_DEBOUNCE_MS } from "../../src/features/office-previews/office-previews-engine";

const DISABLED_NOTICE = "Office-Vorschauen sind in den Einstellungen ausgeschaltet.";

describe("SDD office-previews p2 c21", () => {
	let h: Harness;
	afterEach(() => h.dispose());

	it("shows the status Notice in the pinned format", async () => {
		h = createHarness();
		h.layoutReady();
		await h.runCommand("office-previews-status");
		expect(h.lastNotice()).toBe("Office-Vorschau: 0 aktuell, 0 in der Warteschlange, 0 fehlgeschlagen");
	});

	it("counts sources verified current during reconcile", async () => {
		h = createHarness();
		for (const p of ["a.docx", "b.xlsx"]) {
			const f = h.addSource(p, `content of ${p}`);
			expect(f.path).toBe(p);
			h.putFile(h.mirror(p), markedPreview(p, sha256Of(`content of ${p}`)));
		}
		await h.start();
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toEqual({ current: 2, queued: 0, failed: 0 });
	});

	it("counts sources rendered by this device", async () => {
		h = createHarness();
		h.layoutReady();
		h.createSource("new.docx");
		await h.drain();
		expect(h.renderer.calls).toHaveLength(1);
		expect(await h.status()).toEqual({ current: 1, queued: 0, failed: 0 });
	});

	it("reports the queue length while jobs wait for their delay", async () => {
		h = createHarness();
		h.layoutReady();
		h.createSource("a.docx");
		h.createSource("b.pptx");
		await h.advance(MODIFY_DEBOUNCE_MS + 1_000);
		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toEqual({ current: 0, queued: 2, failed: 0 });
	});

	it("reports the number of failure entries", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.layoutReady();
		h.createSource("bad.docx");
		await h.drain();
		expect(h.renderer.calls).toHaveLength(1);
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });
	});

	it("shows the disabled Notice instead of counts when the feature is off", async () => {
		h = createHarness({ enabled: false });
		h.layoutReady();
		await h.runCommand("office-previews-status");
		expect(h.lastNotice()).toBe(DISABLED_NOTICE);
		expect(h.notices().some((n) => n.includes("aktuell"))).toBe(false);
	});
});
