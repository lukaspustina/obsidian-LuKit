// Pins for mutants that survived the auto-embed range (adlc mutate-diff, 2026-10-05):
// each test names the behaviour a surviving mutant broke without any test failing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, markedPreview, sha256Of, type FakeEditor, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const EMBED = "![[Angebot.docx.png]]";
const COMMAND = "office-previews-embed-missing";
const BUSY = "Einbettung läuft bereits.";

describe("auto embed — surviving-mutant pins", () => {
	let h: Harness;

	afterEach(() => {
		vi.restoreAllMocks();
		h.dispose();
	});

	/** A source with an existing preview (left by an earlier version), linked from `notes`. */
	async function withExistingPreview(notes: Record<string, string>): Promise<void> {
		h = createHarness();
		const content = `content of ${SOURCE}`;
		h.addSource(SOURCE, content);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(content)));
		for (const [path, text] of Object.entries(notes)) h.putFile(path, text);
		await h.start();
	}

	const summaries = (): string[] => h.notices().filter((n) => n.startsWith("Einbettungen ergänzt:"));
	const original = (): ((...args: unknown[]) => Promise<unknown>) =>
		h.vaultProcess.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;

	it("names the error type in the log line of a failed note write", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h = createHarness();
		h.putFile("Notizen/M.md", "siehe [[Angebot.docx]]\n");
		await h.start();
		h.vaultProcess.mockRejectedValueOnce(new TypeError("boom"));
		h.createSource(SOURCE);
		await h.drain();
		await h.settle();
		const lines = warn.mock.calls.map((c) => String(c[0]));
		expect(lines).toContain("LuKit office previews: a note could not be updated with a preview embed (TypeError).");
	});

	it("counts only notes that actually changed (open, closed, already embedded, deleted)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await withExistingPreview({
			"Notizen/A.md": "a [[Angebot.docx]]\n",
			"Notizen/B.md": `b [[Angebot.docx]]\n${EMBED}\n`,
			"Notizen/C.md": "c [[Angebot.docx]]\n",
			"Notizen/D.md": `d [[Angebot.docx]]\n${EMBED}\n`,
			"Notizen/E.md": "e [[Angebot.docx]]\n",
		});
		h.openNote("Notizen/B.md");
		const c = h.openNote("Notizen/C.md");
		h.freezeResolvedLinks();
		h.deleteFile("Notizen/E.md");

		await h.runCommand(COMMAND);
		await h.settle();

		expect(summaries()).toEqual(["Einbettungen ergänzt: 2 in 2 Notizen"]);
		expect(h.readText("Notizen/A.md")).toBe(`a [[Angebot.docx]]\n${EMBED}\n`);
		expect(c.getValue()).toBe(`c [[Angebot.docx]]\n${EMBED}\n`);
		// Skipping B (open, embedded) and E (deleted) is a decision, not a caught error.
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not count a note whose image vanished before its turn", async () => {
		await withExistingPreview({ "Notizen/A.md": "a [[Angebot.docx]]\n", "Notizen/B.md": "b [[Angebot.docx]]\n" });
		const impl = original();
		h.vaultProcess.mockImplementationOnce(async (...args: unknown[]) => {
			const result = await impl(...args);
			h.deleteFile(h.mirror(SOURCE));
			return result;
		});

		await h.runCommand(COMMAND);
		await h.settle();

		expect(summaries()).toEqual(["Einbettungen ergänzt: 1 in 1 Notizen"]);
		expect(h.readText("Notizen/B.md")).toBe("b [[Angebot.docx]]\n");
	});

	it("leaves a note alone when it gained the embed between read and write", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await withExistingPreview({ "Notizen/A.md": "a [[Angebot.docx]]\n" });
		const impl = original();
		h.vaultProcess.mockImplementationOnce(async (...args: unknown[]) => {
			h.putFile("Notizen/A.md", `a [[Angebot.docx]]\n${EMBED}\n`);
			return impl(...args);
		});

		await h.runCommand(COMMAND);
		await h.settle();

		expect(h.readText("Notizen/A.md")).toBe(`a [[Angebot.docx]]\n${EMBED}\n`);
		expect(summaries()).toEqual(["Einbettungen ergänzt: 0 in 0 Notizen"]);
		expect(warn).not.toHaveBeenCalled();
	});

	it("stops writing into open editors once the feature is disabled mid-pass", async () => {
		h = createHarness();
		h.putFile("Notizen/A.md", "a [[Angebot.docx]]\n");
		h.putFile("Notizen/B.md", "b [[Angebot.docx]]\n");
		await h.start();
		const a = h.openNote("Notizen/A.md");
		const b = h.openNote("Notizen/B.md");
		const transact = a.transaction.bind(a);
		a.transaction = (tx: Parameters<FakeEditor["transaction"]>[0]): void => {
			transact(tx);
			h.setEnabled(false);
		};

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(a.getValue()).toBe(`a [[Angebot.docx]]\n${EMBED}\n`);
		expect(b.transactions).toHaveLength(0);
		expect(b.getValue()).toBe("b [[Angebot.docx]]\n");
	});

	it("writes into the editor of the linking note, not into another open note", async () => {
		h = createHarness();
		h.putFile("Notizen/X.md", "nichts verlinkt\n");
		h.putFile("Notizen/Y.md", "y [[Angebot.docx]]\n");
		await h.start();
		const x = h.openNote("Notizen/X.md");
		const y = h.openNote("Notizen/Y.md");

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(x.getValue()).toBe("nichts verlinkt\n");
		expect(x.transactions).toHaveLength(0);
		expect(y.getValue()).toBe(`y [[Angebot.docx]]\n${EMBED}\n`);
	});

	it("skips an empty leaf without a file while looking for the note's editor", async () => {
		h = createHarness();
		h.putFile("Notizen/M.md", "m [[Angebot.docx]]\n");
		await h.start();
		h.openNote("Notizen/gibt-es-nicht.md");

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.readText("Notizen/M.md")).toBe(`m [[Angebot.docx]]\n${EMBED}\n`);
	});

	it("does not treat an image outside the preview folder as part of the preview block", async () => {
		h = createHarness();
		h.putFile("Bilder/Foto.png", "png");
		h.putFile("Notizen/M.md", "siehe [[Angebot.docx]]\n![[Foto.png]]\n");
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.readText("Notizen/M.md")).toBe(`siehe [[Angebot.docx]]\n${EMBED}\n![[Foto.png]]\n`);
	});

	it("does not treat an image in a sibling folder of the preview folder as a preview", async () => {
		h = createHarness();
		h.putFile("_previews-alt/Foto.png", "png");
		h.putFile("Notizen/M.md", "siehe [[Angebot.docx]]\n![[Foto.png]]\n");
		await h.start();

		h.createSource(SOURCE);
		await h.drain();
		await h.settle();

		expect(h.readText("Notizen/M.md")).toBe(`siehe [[Angebot.docx]]\n${EMBED}\n![[Foto.png]]\n`);
	});

	it("keeps rejecting re-entry after a reset while a newer run is active", async () => {
		await withExistingPreview({ "Notizen/A.md": "a [[Angebot.docx]]\n", "Notizen/B.md": "b [[Angebot.docx]]\n" });
		const impl = original();
		const gates: (() => void)[] = [];
		h.vaultProcess.mockImplementation(async (...args: unknown[]) => {
			await new Promise<void>((resolve) => gates.push(resolve));
			return impl(...args);
		});
		const invoke = (): void => {
			void h.plugin.commands.get(COMMAND)?.callback?.();
		};

		invoke();
		await h.settle();
		expect(gates).toHaveLength(1);
		h.setEnabled(false);
		h.setEnabled(true);
		invoke();
		await h.settle();
		gates.shift()?.();
		await h.settle();

		// Run 1 has ended; run 2 now holds its first write. A third call must be refused.
		expect(gates).toHaveLength(1);
		invoke();
		await h.settle();
		expect(h.notices().filter((n) => n === BUSY)).toHaveLength(1);

		for (let i = 0; i < 5 && gates.length > 0; i++) {
			gates.shift()?.();
			await h.settle();
		}
	});

	it("drops a pass that waits for its image when the feature is reset, without an indexing warning", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		h = createHarness();
		h.putFile("Notizen/M.md", "m [[Angebot.docx]]\n");
		await h.start();
		h.deferIndexing(h.mirror(SOURCE));
		h.createSource(SOURCE);
		// Step to the render only: drain() would run far past the 60 s image deadline.
		for (let i = 0; i < 200 && h.renderer.calls.length === 0; i++) await h.advance(1_000);
		await h.settle();
		expect(h.renderer.calls).toHaveLength(1);

		h.setEnabled(false);
		h.setEnabled(true);
		await h.settle();
		h.releaseIndexing(h.mirror(SOURCE));
		await h.advance(61_000);
		await h.settle();

		expect(h.readText("Notizen/M.md")).toBe("m [[Angebot.docx]]\n");
		expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("not indexed"))).toEqual([]);
	});
});
