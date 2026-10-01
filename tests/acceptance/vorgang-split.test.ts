import { describe, it, expect, beforeEach, vi } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import type { SplitSelection } from "../../src/features/vorgang/vorgang-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";
import type { MockTFile } from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

const SOURCE_CONTENT =
	"---\ntags: [Vorgang]\n---\n" +
	"# Fakten und Pointer\n" +
	"- Quellfakt\n" +
	"- Bleibt\n" +
	"\n" +
	"# Inhalt\n" +
	"- [[#Quellsektion, 01.07.2026]]\n" +
	"\n" +
	"##### Quellsektion, 01.07.2026\n" +
	"- Quellinhalt\n";

const TARGET_CONTENT =
	"---\ntags: [Vorgang]\n---\n" +
	"# Fakten und Pointer\n" +
	"- Zielfakt\n" +
	"\n" +
	"# Inhalt\n" +
	"- [[#Zielsektion, 30.06.2026]]\n" +
	"\n" +
	"##### Zielsektion, 30.06.2026\n" +
	"- Zielinhalt\n";

// lineIndex of "- Quellfakt" and "##### Quellsektion, 01.07.2026".
const SELECTION: SplitSelection = { facts: [4], sections: [10] };
const DIARY_EMPTY = "---\n---\n\n---\n";

interface SplitInternals {
	splitInto: (s: MockTFile, content: string, sel: SplitSelection, t: MockTFile) => Promise<void>;
	splitVorgangCmd: () => Promise<void>;
}

function setup(sourceContent = SOURCE_CONTENT) {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new VorgangFeature();
	feature.onload(asLuKitPlugin(plugin));

	const source: MockTFile = createMockTFile("Vorgänge/Vorgang - Quelle.md");
	const target: MockTFile = createMockTFile("Vorgänge/Vorgang - Ziel.md");
	app.vault.register(source, sourceContent);
	app.vault.register(target, TARGET_CONTENT);
	app.metadataCache.setFrontmatter(source.path, { tags: ["Vorgang"] });
	app.metadataCache.setFrontmatter(target.path, { tags: ["Vorgang"] });

	plugin.settings.workDiary.diaryNotePath = "Diary.md";
	const diary = createMockTFile("Diary.md");
	app.vault.register(diary, DIARY_EMPTY);

	return { app, internals: feature as unknown as SplitInternals, source, target, diary };
}

describe("vorgang-split: move parts into another Vorgang", () => {
	it("moves the selected parts, leaves a pointer in the source and logs the split", async () => {
		const { app, internals, source, target, diary } = setup();

		await internals.splitInto(source, SOURCE_CONTENT, SELECTION, target);

		const targetContent = app.vault.files.get(target.path)!;
		expect(targetContent).toContain("- Zielfakt\n- Quellfakt\n");
		expect(targetContent).toContain("##### Quellsektion, 01.07.2026\n- Quellinhalt");
		expect(targetContent).toContain("- [[#Quellsektion, 01.07.2026]]");

		const sourceContent = app.vault.files.get(source.path)!;
		expect(sourceContent).not.toContain("Quellfakt");
		expect(sourceContent).not.toContain("Quellsektion");
		expect(sourceContent).toMatch(/- Bleibt\n- Teile verschoben nach \[\[Vorgang - Ziel\]\] \(\d{2}\.\d{2}\.\d{4}\)/);

		expect(app.vault.files.get(diary.path)).toContain("- [[Vorgang - Quelle]] → 2 Teile in [[Vorgang - Ziel]] verschoben");
		expect(lastNotice()).toBe("„Vorgang - Quelle“ → „Vorgang - Ziel“: 1 Fakt, 1 Sektion verschoben.");
	});

	it("leaves the source byte-identical and writes no diary entry when the target write fails", async () => {
		const { app, internals, source, target, diary } = setup();
		const orig = app.vault.process;
		app.vault.process = (async (f: MockTFile, fn: (content: string) => string): Promise<void> => {
			if (f.path === target.path) throw new Error("Platte voll");
			return orig(f, fn);
		}) as typeof app.vault.process;

		await internals.splitInto(source, SOURCE_CONTENT, SELECTION, target);

		expect(app.vault.files.get(source.path)).toBe(SOURCE_CONTENT);
		expect(app.vault.files.get(diary.path)).toBe(DIARY_EMPTY);
		expect(lastNotice()).toBe("Verschieben fehlgeschlagen: Platte voll");
	});

	it("does not rewrite a source that changed after the selection was made", async () => {
		const { app, internals, source, target, diary } = setup();
		const edited = SOURCE_CONTENT + "- Nachtrag\n";
		app.vault.files.set(source.path, edited);

		await internals.splitInto(source, SOURCE_CONTENT, SELECTION, target);

		expect(app.vault.files.get(source.path)).toBe(edited);
		expect(app.vault.files.get(target.path)).toContain("- Quellfakt");
		expect(app.vault.files.get(diary.path)).toBe(DIARY_EMPTY);
		expect(lastNotice()).toBe("Ziel aktualisiert, aber Quelle konnte nicht bereinigt werden: Quelle wurde zwischenzeitlich geändert");
	});

	it("rejects a note without facts or sections before opening the picker", async () => {
		const { app, internals, source } = setup("---\ntags: [Vorgang]\n---\n# Inhalt\n");
		app.workspace.activeFile = source;
		const process = vi.spyOn(app.vault, "process");

		await internals.splitVorgangCmd();

		expect(lastNotice()).toBe("„Vorgang - Quelle“ hat keine Fakten oder Abschnitte zum Verschieben.");
		expect(process).not.toHaveBeenCalled();
	});

	it("rejects a note that is already done", async () => {
		const { app, internals, source } = setup();
		app.metadataCache.setFrontmatter(source.path, { tags: ["Vorgang", "Done"] });
		app.workspace.activeFile = source;

		await internals.splitVorgangCmd();

		expect(lastNotice()).toBe("„Vorgang - Quelle“ ist bereits abgeschlossen.");
	});
});
