import { describe, it, expect, vi, beforeEach } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import {
	createMockApp,
	createMockEditor,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

describe("BesprechungFeature.filePendingCmd", () => {
	it("emits a Notice and exits when no pending besprechungen exist", () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		plugin.commands.get("besprechung-file-pending")?.callback?.();

		expect(lastNotice()).toContain('No Besprechungen tagged "todo"');
	});

	it("processes besprechungen in oldest-first order by ctime", () => {
		const newer = createMockTFile("Besprechungen/Newer.md", { ctime: 200 });
		const older = createMockTFile("Besprechungen/Older.md", { ctime: 100 });

		const app = createMockApp({});
		app.vault.register(newer, "");
		app.vault.register(older, "");
		app.metadataCache.setFrontmatter(newer.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(older.path, { tags: ["Besprechung", "todo"] });

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		const found = (feature as unknown as { findPendingBesprechungen: () => { basename: string }[] }).findPendingBesprechungen();
		expect(found.map((f) => f.basename)).toEqual(["Older", "Newer"]);
	});

	it("processes besprechungen in newest-first order when configured", () => {
		const newer = createMockTFile("Besprechungen/Newer.md", { ctime: 200 });
		const older = createMockTFile("Besprechungen/Older.md", { ctime: 100 });

		const app = createMockApp({});
		app.vault.register(newer, "");
		app.vault.register(older, "");
		app.metadataCache.setFrontmatter(newer.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(older.path, { tags: ["Besprechung", "todo"] });

		const plugin = createMockPlugin(
			makeTestSettings({ besprechung: { ...makeTestSettings().besprechung, pendingOrder: "newest" } }),
			app,
		);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		const found = (feature as unknown as { findPendingBesprechungen: () => { basename: string }[] }).findPendingBesprechungen();
		expect(found.map((f) => f.basename)).toEqual(["Newer", "Older"]);
	});

	it("dropPending removes the pending tag without filing", async () => {
		const besprechung = createMockTFile("Besprechungen/Foo.md");
		const app = createMockApp({});
		app.vault.register(besprechung, "");
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { dropPending: (b: typeof besprechung) => Promise<void> }).dropPending(besprechung);

		const fm = app.fileManager.frontmatter.get(besprechung.path);
		expect(fm?.tags).toBeUndefined();
		expect(lastNotice()).toContain("Removed");
		expect(lastNotice()).toContain("(not filed)");
	});

	it("vorgangAlreadyLinks detects existing wikilink in # Inhalt regardless of date format", () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		const vorgangContent = [
			"# Fakten und Pointer",
			"- something",
			"",
			"# Inhalt",
			"- [[Meeting-A#§ Summary, 01.01.2026|Meeting-A: Summary, 01.01.2026]]",
			"- [[#Other Meeting, 02.01.2026]]",
		].join("\n");

		const result = (feature as unknown as { vorgangAlreadyLinks: (c: string, n: string) => boolean }).vorgangAlreadyLinks(
			vorgangContent,
			"Meeting-A",
		);
		expect(result).toBe(true);
	});

	it("creates a diary entry when filing a besprechung into a vorgang", async () => {
		const besprechung = createMockTFile("Besprechungen/Foo.md");
		const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
		const diary = createMockTFile("Diary.md");

		const diaryContent = "---\n---\n\n---\n";
		const app = createMockApp({});
		app.vault.register(besprechung, "### Nächste Schritte\n- Step\n");
		app.vault.register(vorgang, "# Inhalt\n");
		app.vault.register(diary, diaryContent);
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });

		const settings = makeTestSettings({ workDiary: { diaryNotePath: "Diary.md" } });
		const plugin = createMockPlugin(settings, app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void> }).fileBesprechungIntoVorgang(
			besprechung,
			vorgang,
		);

		const updatedDiary = app.vault.files.get(diary.path) ?? "";
		expect(updatedDiary).toContain("Foo");
		expect(updatedDiary).toContain("Vorgang - X");
	});

	// REQ-13 step-2 failure: filing succeeded but tag-removal threw. The Notice
	// must distinguish this from total failure.
	it("emits 'filed but failed to remove tag' when step 2 throws (TS-03)", async () => {
		const besprechung = createMockTFile("Besprechungen/Foo.md");
		const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");

		const app = createMockApp({});
		app.vault.register(besprechung, "### Nächste Schritte\n- Step\n");
		app.vault.register(vorgang, "# Inhalt\n");
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });

		let calls = 0;
		const realProcess = app.fileManager.processFrontMatter;
		app.fileManager.processFrontMatter = vi.fn(async (file, fn) => {
			calls++;
			if (calls === 2) throw new Error("processFrontMatter failed");
			return realProcess(file, fn);
		});

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void> }).fileBesprechungIntoVorgang(
			besprechung,
			vorgang,
		);

		expect(lastNotice()).toContain("filed");
		expect(lastNotice()).toContain("failed to remove tag");
		expect(lastNotice()).not.toContain("Failed to file");
	});
});

describe("BesprechungFeature.insertBesprechungSummary — section note path", () => {
	it("creates a diary entry when inserting a summary into a section note", async () => {
		const besprechung = createMockTFile("Besprechungen/Foo.md");
		const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");
		const diary = createMockTFile("Diary.md");

		const diaryContent = "---\n---\n\n---\n";
		const app = createMockApp({});
		app.vault.register(besprechung, "### Nächste Schritte\n- Step\n");
		app.vault.register(vorgang, "# Inhalt\n");
		app.vault.register(diary, diaryContent);
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });

		const editor = createMockEditor("# Inhalt\n");
		app.workspace.activeEditor = { editor };
		app.workspace.activeFile = vorgang;

		const settings = makeTestSettings({ workDiary: { diaryNotePath: "Diary.md" } });
		const plugin = createMockPlugin(settings, app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { insertBesprechungSummary: (b: typeof besprechung) => Promise<void> }).insertBesprechungSummary(
			besprechung,
		);

		const updatedDiary = app.vault.files.get(diary.path) ?? "";
		expect(updatedDiary).toContain("Foo");
		expect(updatedDiary).toContain("Vorgang - X");
	});
});
