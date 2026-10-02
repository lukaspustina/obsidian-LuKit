import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const COUNT = 50;
const notePath = (i: number): string => `Notizen/M${String(i).padStart(2, "0")}.md`;
const BEFORE = "text with [[Angebot.docx]]\n";
const AFTER = "text with [[Angebot.docx]]\n![[Angebot.docx.png]]\n";

describe("SDD office-previews-auto-embed p2 c8", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	const wrapProcess = (onWritten?: (done: number) => void): { stats: { active: number; maxActive: number; calls: number } } => {
		const original = h.vaultProcess.getMockImplementation();
		if (!original) throw new Error("vaultProcess has no implementation");
		const stats = { active: 0, maxActive: 0, calls: 0 };
		h.vaultProcess.mockImplementation(async (...args: unknown[]) => {
			stats.active++;
			stats.calls++;
			stats.maxActive = Math.max(stats.maxActive, stats.active);
			try {
				return await original(...args);
			} finally {
				stats.active--;
				onWritten?.(stats.calls);
			}
		});
		return { stats };
	};

	it("writes 50 linking notes one at a time with a zero-delay yield between them", async () => {
		h = createHarness();
		for (let i = 0; i < COUNT; i++) h.putFile(notePath(i), BEFORE);
		await h.start();
		const { stats } = wrapProcess();
		const timersBefore = h.zeroDelayTimers;

		h.createSource(SOURCE);
		await h.drain();
		await h.advance(500);

		expect(stats.calls).toBe(COUNT);
		expect(stats.maxActive).toBe(1);
		expect(h.zeroDelayTimers - timersBefore).toBeGreaterThanOrEqual(COUNT - 1);
		for (let i = 0; i < COUNT; i++) expect(h.readText(notePath(i))).toBe(AFTER);
	});

	it("writes no further note after unload mid-pass", async () => {
		h = createHarness();
		for (let i = 0; i < COUNT; i++) h.putFile(notePath(i), BEFORE);
		await h.start();
		let unloadedAt = -1;
		const { stats } = wrapProcess((done) => {
			if (done === 3 && unloadedAt < 0) {
				unloadedAt = done;
				h.unload();
			}
		});

		h.createSource(SOURCE);
		await h.drain();
		await h.advance(500);

		expect(unloadedAt).toBe(3);
		expect(stats.calls).toBe(3);
		const embedded = Array.from({ length: COUNT }, (_, i) => h.readText(notePath(i))).filter((t) => t === AFTER);
		expect(embedded).toHaveLength(3);
	});
});
