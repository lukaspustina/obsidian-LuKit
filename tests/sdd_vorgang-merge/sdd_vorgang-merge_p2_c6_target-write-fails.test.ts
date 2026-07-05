import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
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

const SOURCE_FRONTMATTER = "---\ntags: [Vorgang]\n---";

const SOURCE_CONTENT =
	`${SOURCE_FRONTMATTER}\n` +
	"# Fakten und Pointer\n" +
	"- Quellfakt\n" +
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

function setup() {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new VorgangFeature();
	feature.onload(asLuKitPlugin(plugin));

	const source: MockTFile = createMockTFile("Vorgänge/Vorgang - Quelle.md");
	const target: MockTFile = createMockTFile("Vorgänge/Vorgang - Ziel.md");
	app.vault.register(source, SOURCE_CONTENT);
	app.vault.register(target, TARGET_CONTENT);

	const sourceFm = { tags: ["Vorgang"], note_type: "tasknote" };
	app.metadataCache.setFrontmatter(source.path, sourceFm);
	app.fileManager.frontmatter.set(source.path, { ...sourceFm });

	const targetFm = { tags: ["Vorgang"] };
	app.metadataCache.setFrontmatter(target.path, targetFm);
	app.fileManager.frontmatter.set(target.path, { ...targetFm });

	plugin.settings.workDiary.diaryNotePath = "Diary.md";
	const diary = createMockTFile("Diary.md");
	app.vault.register(diary, "---\n---\n\n---\n");

	return { app, plugin, feature, source, target, diary };
}

describe("SDD vorgang-merge p2 c6 — target write fails (R11)", () => {
	it("resolves without throwing, leaves the source byte-identical with no doneTag, shows the failure Notice, and writes no diary entry", async () => {
		const { app, feature, source, target, diary } = setup();

		const orig = app.vault.process;
		app.vault.process = (async (f: MockTFile, fn: (content: string) => string): Promise<void> => {
			if (f.path === target.path) {
				throw new Error("Platte voll");
			}
			return orig(f, fn);
		}) as typeof app.vault.process;

		await expect(
			(feature as unknown as {
				mergeInto: (s: MockTFile, t: MockTFile) => Promise<void>;
			}).mergeInto(source, target),
		).resolves.toBeUndefined();

		// Source is byte-identical to its original content — no stub written.
		expect(app.vault.files.get(source.path)).toBe(SOURCE_CONTENT);

		// No doneTag added to the source frontmatter.
		const sourceFm = app.fileManager.frontmatter.get(source.path);
		expect(sourceFm?.tags).toEqual(["Vorgang"]);
		expect(sourceFm?.note_type).toBe("tasknote");

		// Failure Notice.
		expect(lastNotice()).toContain("Merge fehlgeschlagen:");
		expect(lastNotice()).toContain("Platte voll");

		// No diary entry created.
		expect(app.vault.files.get(diary.path)).toBe("---\n---\n\n---\n");
	});
});
