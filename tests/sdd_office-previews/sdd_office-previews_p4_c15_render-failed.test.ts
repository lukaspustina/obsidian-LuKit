import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p4 c15", () => {
	let h: Harness;
	const spies: MockInstance[] = [];

	afterEach(() => {
		for (const s of spies.splice(0)) s.mockRestore();
		h.dispose();
	});

	it("leaves the note unchanged and shows exactly one path-free Notice naming the document", async () => {
		h = createHarness();
		for (const m of ["log", "info", "warn", "error"] as const) {
			spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
		}
		const note = "Notizen/N.md";
		const original = "Intro\n![[Angebot.docx]]\n";
		h.putFile(note, original);
		const ed = h.openNote(note);
		await h.start();
		h.renderer.failWith("exit");

		h.drop(note, ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();

		expect(h.renderer.calls).toHaveLength(1);
		expect(ed.getValue()).toBe(original);
		expect(ed.transactions).toHaveLength(0);
		expect(h.readText(note)).toBe(original);

		const failures = h.notices().filter((n) => n.includes("fehlgeschlagen"));
		expect(failures).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
		expect(failures[0]).not.toContain("_resources");

		const consoleText = spies.flatMap((s) => s.mock.calls).map((args) => args.map(String).join(" ")).join("\n");
		expect(consoleText).not.toContain("Angebot");
		expect(consoleText).not.toContain("_resources");
	});
});
