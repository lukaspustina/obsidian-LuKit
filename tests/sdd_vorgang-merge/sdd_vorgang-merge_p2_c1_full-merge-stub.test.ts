import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
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

	return { app, plugin, feature, source, target };
}

describe("SDD vorgang-merge p2 c1 — full merge + stub", () => {
	it("merges the source h5 section into the target and stubs the source with doneTag, no note_type, unchanged path", async () => {
		const { app, feature, source, target } = setup();
		const originalSourcePath = source.path;
		const originalSourceBasename = source.basename;

		await (feature as unknown as {
			mergeInto: (s: MockTFile, t: MockTFile) => Promise<void>;
		}).mergeInto(source, target);

		const targetContent = app.vault.files.get(target.path);
		expect(targetContent).toContain("##### Quellsektion, 01.07.2026");
		expect(targetContent).toContain("- Quellinhalt");
		expect(targetContent).toContain("[[#Quellsektion, 01.07.2026]]");

		const expectedStub = `${SOURCE_FRONTMATTER}\n\nZusammengeführt in [[Vorgang - Ziel]].\n`;
		expect(app.vault.files.get(source.path)).toBe(expectedStub);

		const sourceFm = app.fileManager.frontmatter.get(source.path);
		expect(sourceFm?.tags).toEqual(["Vorgang", "Done"]);
		expect(sourceFm?.note_type).toBeUndefined();

		expect(source.path).toBe(originalSourcePath);
		expect(source.basename).toBe(originalSourceBasename);
	});
});
