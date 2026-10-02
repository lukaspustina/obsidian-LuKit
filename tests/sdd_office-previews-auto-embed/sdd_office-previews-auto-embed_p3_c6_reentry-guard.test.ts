import { afterEach, describe, expect, it } from "vitest";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

const COMMAND = "office-previews-embed-missing";
const SOURCE = "_resources/Angebot.docx";
const NOTES = ["Notizen/M1.md", "Notizen/M2.md", "Notizen/M3.md"];
const SUMMARY = /^Einbettungen ergänzt: \d+ in \d+ Notizen$/;

describe("SDD office-previews-auto-embed p3 c6", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	/** Existing preview (as left by an earlier version), linking notes without embeds. */
	async function setup(): Promise<void> {
		h = createHarness();
		const content = `content of ${SOURCE}`;
		h.addSource(SOURCE, content);
		h.putFile(h.mirror(SOURCE), markedPreview(SOURCE, sha256Of(content)));
		NOTES.forEach((p, i) => h.putFile(p, `Notiz ${i + 1}: [[Angebot.docx]]\n`));
		await h.start();
	}

	/** Holds every vault.process call until `release()`. */
	function gateProcess(): { release: () => void } {
		const impl = h.vaultProcess.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
		let open!: () => void;
		const gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		h.vaultProcess.mockImplementation(async (...args: unknown[]) => {
			await gate;
			return impl(...args);
		});
		return { release: open };
	}

	const invoke = (): void => {
		void h.plugin.commands.get(COMMAND)?.callback?.();
	};
	const summaries = (): string[] => h.notices().filter((n) => SUMMARY.test(n));

	it("rejects a second invocation while a run is active and starts no second pass", async () => {
		await setup();
		const { release } = gateProcess();

		invoke();
		await h.settle();
		const callsDuringRun = h.vaultProcess.mock.calls.length;
		expect(callsDuringRun).toBeGreaterThan(0);

		invoke();
		await h.settle();

		expect(h.notices().filter((n) => n === "Einbettung läuft bereits.")).toHaveLength(1);
		expect(h.vaultProcess.mock.calls.length).toBe(callsDuringRun);

		release();
		await h.advance(500);
		await h.settle();

		expect(summaries()).toEqual(["Einbettungen ergänzt: 3 in 3 Notizen"]);
		NOTES.forEach((p, i) => expect(h.readText(p)).toBe(`Notiz ${i + 1}: [[Angebot.docx]]\n![[Angebot.docx.png]]\n`));
	});

	it("clears the flag on stopWork so a new run is accepted and completes with a summary", async () => {
		await setup();
		const { release } = gateProcess();

		invoke();
		await h.settle();
		expect(h.vaultProcess.mock.calls.length).toBeGreaterThan(0);

		h.setEnabled(false);
		h.setEnabled(true);
		release();
		await h.advance(500);
		await h.settle();

		const before = summaries().length;
		invoke();
		await h.advance(500);
		await h.settle();

		expect(h.notices()).not.toContain("Einbettung läuft bereits.");
		expect(summaries().length).toBe(before + 1);
		NOTES.forEach((p, i) => expect(h.readText(p)).toBe(`Notiz ${i + 1}: [[Angebot.docx]]\n![[Angebot.docx.png]]\n`));
	});
});
