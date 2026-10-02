import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { DROP_EMBED_DEADLINE_MS } from "../../src/features/office-previews/office-previews-engine";

const WAITING = "_resources/Preis.docx";
const OTHER = "_resources/Angebot.docx";
const WAITING_NOTE = "Notizen/P.md";
const OTHER_NOTE = "Notizen/A.md";
const WAITING_BEFORE = "Preis: [[Preis.docx]]\n";
const OTHER_BEFORE = "Angebot: [[Angebot.docx]]\n";
const OTHER_AFTER = "Angebot: [[Angebot.docx]]\n![[Angebot.docx.png]]\n";
const WAITING_AFTER = "Preis: [[Preis.docx]]\n![[Preis.docx.png]]\n";

// Seed 12: both renders land within the deadline of each other (~42 s and ~61 s),
// so the second source is rendered while the first still waits for its index entry.
const SEED = 12;

describe("SDD office-previews-auto-embed p2 c15", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
		vi.restoreAllMocks();
	});

	const setup = async (): Promise<void> => {
		h = createHarness({ seed: SEED });
		h.putFile(WAITING_NOTE, WAITING_BEFORE);
		h.putFile(OTHER_NOTE, OTHER_BEFORE);
		await h.start();
		h.deferIndexing(h.mirror(WAITING));
		h.createSource(WAITING);
		h.createSource(OTHER);
		const rendered = (): string[] => h.renderer.renderedPaths();
		for (let i = 0; i < 130 && !(rendered().includes(WAITING) && rendered().includes(OTHER)); i++) await h.advance(1000);
		await h.settle();
	};

	it("proceeds when the vault create event arrives within the deadline, without blocking other sources", async () => {
		await setup();
		expect(h.renderer.renderedPaths()).toContain(WAITING);
		expect(h.readText(OTHER_NOTE)).toBe(OTHER_AFTER);
		expect(h.readText(WAITING_NOTE)).toBe(WAITING_BEFORE);

		await h.advance(3000);
		h.releaseIndexing(h.mirror(WAITING));
		await h.settle();

		expect(h.readText(WAITING_NOTE)).toBe(WAITING_AFTER);
		expect(h.readText(OTHER_NOTE)).toBe(OTHER_AFTER);
	});

	it("skips the source with one log line when no create event arrives by the deadline, others unaffected", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await setup();
		expect(h.readText(OTHER_NOTE)).toBe(OTHER_AFTER);

		await h.advance(DROP_EMBED_DEADLINE_MS + 5000);
		await h.settle();

		expect(h.readText(WAITING_NOTE)).toBe(WAITING_BEFORE);
		expect(h.readText(OTHER_NOTE)).toBe(OTHER_AFTER);
		const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("LuKit office previews: "));
		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain("Preis");
		expect(h.notices()).toEqual([]);
	});
});
