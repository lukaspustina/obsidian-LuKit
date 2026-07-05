import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	createMockTFile,
	resetNotices,
} from "../helpers/obsidian-mocks";
import type { MockTFile } from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

describe("SDD vorgang-merge p2 c4 — diary entry on successful merge", () => {
	it("logs '- [[<Quelle>]] → in [[<Ziel>]] zusammengeführt' to the configured diary", async () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		const source: MockTFile = createMockTFile("Vorgänge/Vorgang - Quelle.md");
		const target: MockTFile = createMockTFile("Vorgänge/Vorgang - Ziel.md");

		const sourceContent = "---\ntags:\n  - Vorgang\n---\n# Fakten und Pointer\n- Fakt A\n\n# Inhalt\n";
		const targetContent = "---\ntags:\n  - Vorgang\n---\n# Fakten und Pointer\n- Fakt X\n\n# Inhalt\n";
		app.vault.register(source, sourceContent);
		app.vault.register(target, targetContent);
		app.metadataCache.setFrontmatter(source.path, { tags: ["Vorgang"] });
		app.metadataCache.setFrontmatter(target.path, { tags: ["Vorgang"] });
		app.fileManager.frontmatter.set(source.path, { tags: ["Vorgang"] });
		app.fileManager.frontmatter.set(target.path, { tags: ["Vorgang"] });

		const diary = createMockTFile("Diary.md");
		app.vault.register(diary, "---\n---\n\n---\n");
		plugin.settings.workDiary.diaryNotePath = "Diary.md";

		await (feature as unknown as {
			mergeInto: (source: MockTFile, target: MockTFile) => Promise<void>;
		}).mergeInto(source, target);

		expect(app.vault.files.get("Diary.md")).toContain(
			"- [[Vorgang - Quelle]] → in [[Vorgang - Ziel]] zusammengeführt",
		);
	});
});
