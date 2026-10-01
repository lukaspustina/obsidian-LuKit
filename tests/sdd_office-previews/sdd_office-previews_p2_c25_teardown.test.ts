import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c25", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("clears pending debounce, jitter and reconcile timers on unload so nothing renders afterwards", async () => {
		h = createHarness();
		h.addSource("reconcile-only.docx");
		h.layoutReady();
		// Reconcile timer is still pending (120 s). Add a debounced create and a debounced modify.
		await h.advance(10_000);
		h.createSource("created.docx");
		h.addSource("modified.xlsx");
		h.changeSource("modified.xlsx", "changed content");

		h.unload();
		const timersAfterUnload = vi.getTimerCount();
		await h.advance(600_000);
		await h.drain();

		expect(timersAfterUnload).toBe(0);
		expect(h.renderer.calls).toHaveLength(0);
		expect(h.adapterCalls.filter((c) => c.op === "writeBinary")).toHaveLength(0);
		expect(h.preview("created.docx")).toBeUndefined();
		expect(h.preview("reconcile-only.docx")).toBeUndefined();
		expect(h.preview("modified.xlsx")).toBeUndefined();
	});

	it("clears pending jitter timers of queued jobs on unload", async () => {
		h = createHarness();
		await h.start();
		h.createSource("a.docx");
		h.createSource("b.docx");
		// Past the debounce, inside the jitter window: jobs are queued, none due yet.
		await h.advance(6_000);
		expect(h.renderer.calls).toHaveLength(0);

		h.unload();
		await h.drain();

		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview("a.docx")).toBeUndefined();
		expect(h.preview("b.docx")).toBeUndefined();
	});

	it("kills the in-flight render on unload and writes nothing when it resolves later", async () => {
		h = createHarness();
		await h.start();
		h.renderer.hold();
		h.createSource("flight.docx");
		h.createSource("pending.docx");
		h.changeSource("debounced.xlsx", "x");

		// Advance until the first render is in flight.
		for (let i = 0; i < 30 && h.renderer.calls.length === 0; i++) await h.advance(10_000);
		expect(h.renderer.calls).toHaveLength(1);
		expect(h.renderer.inFlight).toBe(1);

		h.unload();
		const savesAtUnload = h.saveLocalStorageCalls.length;
		const writesAtUnload = h.adapterCalls.filter((c) => c.op === "writeBinary").length;

		expect(h.renderer.disposeCalls).toBeGreaterThanOrEqual(1);

		// The render resolves successfully after unload.
		h.renderer.release();
		await h.settle();
		await h.drain();

		expect(h.adapterCalls.filter((c) => c.op === "writeBinary")).toHaveLength(writesAtUnload);
		expect(h.preview("flight.docx")).toBeUndefined();
		expect(h.saveLocalStorageCalls).toHaveLength(savesAtUnload);
		// Remaining queued jobs never start.
		expect(h.renderer.calls).toHaveLength(1);
		expect(h.notices().filter((n) => n.startsWith("Office-Vorschau fehlgeschlagen"))).toHaveLength(0);
	});
});
