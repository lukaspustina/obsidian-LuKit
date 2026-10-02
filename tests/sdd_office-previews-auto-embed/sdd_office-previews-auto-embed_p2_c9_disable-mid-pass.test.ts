import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const SOURCE = "_resources/Angebot.docx";
const EMBED = "![[Angebot.docx.png]]";
const NOTE_COUNT = 10;
const WRITES_BEFORE_SWITCH = 3;

function notePaths(): string[] {
	return Array.from({ length: NOTE_COUNT }, (_, i) => `Notizen/M${String(i).padStart(2, "0")}.md`);
}

function original(n: number): string {
	return `Notiz ${n}: siehe [[Angebot.docx]]\n`;
}

describe("SDD office-previews-auto-embed p2 c9", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	/** Runs the render with a hook that fires `onWrite` after the third completed note write. */
	async function renderWithSwitch(onWrite: () => void): Promise<string[]> {
		h = createHarness();
		await h.start();
		const paths = notePaths();
		paths.forEach((p, i) => h.putFile(p, original(i)));

		const impl = h.vaultProcess.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
		let writes = 0;
		h.vaultProcess.mockImplementation(async (...args: unknown[]) => {
			const result = await impl(...args);
			writes += 1;
			if (writes === WRITES_BEFORE_SWITCH) onWrite();
			return result;
		});

		h.createSource(SOURCE, "document body");
		await h.drain();
		await h.settle();
		await h.advance(200);
		await h.settle();
		return paths;
	}

	function embedded(paths: string[]): string[] {
		return paths.filter((p) => (h.readText(p) ?? "").includes(EMBED));
	}

	it("stops before the next note once the feature is disabled mid-pass", async () => {
		const paths = await renderWithSwitch(() => h.setEnabled(false));

		expect(embedded(paths)).toHaveLength(WRITES_BEFORE_SWITCH);
		expect(h.vaultProcess.mock.calls).toHaveLength(WRITES_BEFORE_SWITCH);
	});

	it("lets the old pass write no further note after disable then enable", async () => {
		const paths = await renderWithSwitch(() => {
			h.setEnabled(false);
			h.setEnabled(true);
		});

		expect(embedded(paths)).toHaveLength(WRITES_BEFORE_SWITCH);
		expect(h.vaultProcess.mock.calls).toHaveLength(WRITES_BEFORE_SWITCH);
		for (const p of paths.filter((x) => !embedded(paths).includes(x))) {
			expect(h.readText(p)).toBe(original(paths.indexOf(p)));
		}
	});
});
