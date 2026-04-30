import { describe, it, expect, vi, beforeEach } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { createMockApp, lastNotice, resetNotices, createMockTFile } from "../helpers/obsidian-mocks";
import type { LuKitSettings } from "../../src/types";

// Builds a minimal LuKitPlugin shim sufficient for feature-class tests.
// Routes addCommand calls to a captured map so tests can invoke them directly.
type CommandSpec = { id: string; name: string; callback?: () => void; editorCallback?: (e: unknown) => void };

function makePlugin(settings: LuKitSettings, app: ReturnType<typeof createMockApp>) {
	const commands = new Map<string, CommandSpec>();
	return {
		settings,
		app,
		features: [],
		addCommand(spec: CommandSpec): void {
			commands.set(spec.id, spec);
		},
		commands,
	};
}

const baseSettings: LuKitSettings = {
	dateLocale: "de",
	workDiary: { diaryNotePath: "" },
	besprechung: {
		folderPath: "Besprechungen",
		sectionHeadings: ["Nächste Schritte", "Zusammenfassung"],
		pendingTag: "todo",
		pendingOrder: "oldest",
	},
};

beforeEach(() => {
	resetNotices();
});

describe("BesprechungFeature.filePendingCmd", () => {
	it("emits a Notice and exits when no pending besprechungen exist", () => {
		const app = createMockApp({});
		const plugin = makePlugin({ ...baseSettings }, app);
		const feature = new BesprechungFeature();
		feature.onload(plugin as never);

		const cmd = plugin.commands.get("besprechung-file-pending");
		cmd?.callback?.();

		expect(lastNotice()).toContain('No Besprechungen tagged "todo"');
	});

	it("processes besprechungen in oldest-first order by ctime", () => {
		const newer = createMockTFile("Besprechungen/Newer.md", { ctime: 200 });
		const older = createMockTFile("Besprechungen/Older.md", { ctime: 100 });

		const app = createMockApp({});
		// Register both so getMarkdownFiles returns them.
		app.vault.register(newer, "### Nächste Schritte\n- Step\n");
		app.vault.register(older, "### Nächste Schritte\n- Step\n");
		app.metadataCache.setFrontmatter(newer.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(older.path, { tags: ["Besprechung", "todo"] });

		const plugin = makePlugin({ ...baseSettings }, app);
		const feature = new BesprechungFeature();
		feature.onload(plugin as never);

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

		const plugin = makePlugin(
			{ ...baseSettings, besprechung: { ...baseSettings.besprechung, pendingOrder: "newest" } },
			app,
		);
		const feature = new BesprechungFeature();
		feature.onload(plugin as never);

		const found = (feature as unknown as { findPendingBesprechungen: () => { basename: string }[] }).findPendingBesprechungen();
		expect(found.map((f) => f.basename)).toEqual(["Newer", "Older"]);
	});

	it("dropPending removes the pending tag without filing", async () => {
		const besprechung = createMockTFile("Besprechungen/Foo.md");
		const app = createMockApp({});
		app.vault.register(besprechung, "");
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });

		const plugin = makePlugin({ ...baseSettings }, app);
		const feature = new BesprechungFeature();
		feature.onload(plugin as never);

		await (feature as unknown as { dropPending: (b: typeof besprechung) => Promise<void> }).dropPending(besprechung);

		const fm = app.fileManager.frontmatter.get(besprechung.path);
		expect(fm?.tags).toBeUndefined();
		expect(lastNotice()).toContain("Removed");
		expect(lastNotice()).toContain("(not filed)");
	});

	it("vorgangAlreadyLinks detects existing wikilink in # Inhalt regardless of date format", () => {
		const app = createMockApp({});
		const plugin = makePlugin({ ...baseSettings }, app);
		const feature = new BesprechungFeature();
		feature.onload(plugin as never);

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

	it("fileBesprechungIntoVorgang emits 'filed but failed to remove tag' when step 2 throws (TS-03)", async () => {
		const besprechung = createMockTFile("Besprechungen/Foo.md");
		const vorgang = createMockTFile("Vorgänge/Vorgang - X.md");

		const app = createMockApp({});
		app.vault.register(besprechung, "### Nächste Schritte\n- Step\n");
		app.vault.register(vorgang, "# Inhalt\n");
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });

		// Make processFrontMatter fail on the SECOND call (the tag-removal step).
		// First call (markFiledInFrontmatter) succeeds; second call (removePendingTag) throws.
		let calls = 0;
		const realProcess = app.fileManager.processFrontMatter;
		app.fileManager.processFrontMatter = vi.fn(async (file, fn) => {
			calls++;
			if (calls === 2) throw new Error("processFrontMatter failed");
			return realProcess(file, fn);
		});

		const plugin = makePlugin({ ...baseSettings }, app);
		const feature = new BesprechungFeature();
		feature.onload(plugin as never);

		await (feature as unknown as { fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void> }).fileBesprechungIntoVorgang(
			besprechung,
			vorgang,
		);

		expect(lastNotice()).toContain("filed");
		expect(lastNotice()).toContain("failed to remove tag");
		expect(lastNotice()).not.toContain("Failed to file");
	});
});
