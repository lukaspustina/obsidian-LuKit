import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	noticeMessages,
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
	"# Inhalt\n";

function setup(settingsOverride: Parameters<typeof makeTestSettings>[0]) {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(settingsOverride), app);
	const feature = new VorgangFeature();
	feature.onload(asLuKitPlugin(plugin));

	const source: MockTFile = createMockTFile("Vorgänge/Vorgang - Quelle.md");
	const target: MockTFile = createMockTFile("Vorgänge/Vorgang - Ziel.md");
	app.vault.register(source, SOURCE_CONTENT);
	app.vault.register(target, TARGET_CONTENT);

	const sourceFm = { tags: ["Vorgang"] };
	app.metadataCache.setFrontmatter(source.path, sourceFm);
	app.fileManager.frontmatter.set(source.path, { ...sourceFm });

	const targetFm = { tags: ["Vorgang"] };
	app.metadataCache.setFrontmatter(target.path, targetFm);
	app.fileManager.frontmatter.set(target.path, { ...targetFm });

	return { app, plugin, feature, source, target };
}

describe("SDD vorgang-merge p2 c5 — missing diary path skips silently", () => {
	it("resolves without throwing and still shows the merge-completion Notice when the diary path is empty", async () => {
		const { feature, source, target } = setup({ workDiary: { diaryNotePath: "" } });

		await expect(
			(feature as unknown as {
				mergeInto: (s: MockTFile, t: MockTFile) => Promise<void>;
			}).mergeInto(source, target),
		).resolves.toBeUndefined();

		const notices = noticeMessages();
		expect(notices.some((n) => n.includes("übernommen"))).toBe(true);
	});

	it("resolves without throwing and still shows the merge-completion Notice when the diary path is set but the note does not exist", async () => {
		const { feature, source, target } = setup({ workDiary: { diaryNotePath: "Tagebuch/Fehlt.md" } });

		await expect(
			(feature as unknown as {
				mergeInto: (s: MockTFile, t: MockTFile) => Promise<void>;
			}).mergeInto(source, target),
		).resolves.toBeUndefined();

		const notices = noticeMessages();
		expect(notices.some((n) => n.includes("übernommen"))).toBe(true);
	});
});
