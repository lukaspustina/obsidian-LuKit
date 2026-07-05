import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockEditor,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	noticeMessages,
	resetNotices,
} from "../helpers/obsidian-mocks";
import type { MockTFile } from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

function setup(activeFile?: MockTFile) {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new VorgangFeature();
	feature.onload(asLuKitPlugin(plugin));
	if (activeFile) {
		app.vault.register(activeFile, "");
		app.workspace.activeFile = activeFile;
	}
	return { app, plugin, feature };
}

describe("VorgangFeature.addVorgangSectionCmd", () => {
	it("emits 'No active note open' Notice when there is no active file", () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		(feature as unknown as { addVorgangSectionCmd: () => void }).addVorgangSectionCmd();

		expect(lastNotice()).toContain("Keine aktive Notiz");
	});
});

describe("VorgangFeature.insertReference", () => {
	it("inserts a linked TOC bullet and h5 section for the picked target", () => {
		const active = createMockTFile("Vorgänge/Vorgang - A.md");
		const { app, feature } = setup(active);
		const editor = createMockEditor("# Fakten und Pointer\n- x\n\n# Inhalt\n");
		app.workspace.activeEditor = { editor };

		const target = createMockTFile("Vorgänge/Vorgang - B.md");
		(feature as unknown as { insertReference: (t: MockTFile) => void }).insertReference(target);

		expect(editor.value).toContain("- [[#Vorgang - B, ");
		expect(editor.value).toContain("##### [[Vorgang - B]], ");
	});
});

describe("VorgangFeature.convertNote", () => {
	it("adds tag, note_type and Created at without touching existing values", async () => {
		const active = createMockTFile("Notizen/Lose Notiz.md", { ctime: new Date(2026, 6, 1, 8, 30, 0).getTime() });
		const { app, feature } = setup(active);
		app.fileManager.frontmatter.set(active.path, { Author: "Max Mustermann" });

		await (feature as unknown as { convertNote: (f: MockTFile, tag: string) => Promise<void> }).convertNote(active, "Vorgang");

		const fm = app.fileManager.frontmatter.get(active.path);
		expect(fm?.tags).toEqual(["Vorgang"]);
		expect(fm?.note_type).toBe("tasknote");
		expect(fm?.["Created at"]).toBe("2026-07-01 08:30:00");
		expect(fm?.Author).toBe("Max Mustermann");
		expect(lastNotice()).toContain("als Vorgang getaggt");
	});

	it("is idempotent — existing note_type and Created at win", async () => {
		const active = createMockTFile("Notizen/Alt.md");
		const { app, feature } = setup(active);
		app.fileManager.frontmatter.set(active.path, { tags: ["Vorgang"], note_type: "tasknote", "Created at": "2025-01-01 10:00:00" });

		await (feature as unknown as { convertNote: (f: MockTFile, tag: string) => Promise<void> }).convertNote(active, "Vorgang");

		const fm = app.fileManager.frontmatter.get(active.path);
		expect(fm?.tags).toEqual(["Vorgang"]);
		expect(fm?.["Created at"]).toBe("2025-01-01 10:00:00");
	});
});

describe("VorgangFeature.closeVorgangCmd", () => {
	function setupClose(fm: Record<string, unknown>) {
		const active = createMockTFile("Vorgänge/Vorgang - X.md");
		const ctx = setup(active);
		ctx.app.metadataCache.setFrontmatter(active.path, fm);
		ctx.app.fileManager.frontmatter.set(active.path, { ...fm });
		return { ...ctx, active };
	}

	it("sets the done tag, removes note_type, renames the file, and logs to the diary", async () => {
		const { app, plugin, feature, active } = setupClose({ tags: ["Vorgang"], note_type: "tasknote", scheduled: "2026-07-06" });
		const diary = createMockTFile("Diary.md");
		app.vault.register(diary, "---\n---\n\n---\n");
		plugin.settings.workDiary.diaryNotePath = "Diary.md";

		await (feature as unknown as { closeVorgangCmd: () => Promise<void> }).closeVorgangCmd();

		const fm = app.fileManager.frontmatter.get("Vorgänge/Vorgang - X - done.md") ?? app.fileManager.frontmatter.get("Vorgänge/Vorgang - X.md");
		expect(fm?.tags).toEqual(["Vorgang", "Done"]);
		expect(fm?.note_type).toBeUndefined();
		expect(fm?.scheduled).toBe("2026-07-06");
		expect(app.fileManager.renamedTo).toEqual(["Vorgänge/Vorgang - X - done.md"]);
		expect(active.basename).toBe("Vorgang - X - done");
		expect(app.vault.files.get("Diary.md")).toContain("- [[Vorgang - X - done]] abgeschlossen");
		expect(lastNotice()).toContain("abgeschlossen");
	});

	it("refuses non-section notes and already-closed notes", async () => {
		const { feature } = setupClose({ tags: ["Sonstiges"] });
		await (feature as unknown as { closeVorgangCmd: () => Promise<void> }).closeVorgangCmd();
		expect(lastNotice()).toContain("keine Zielnotiz");

		const closed = setupClose({ tags: ["Vorgang", "Done"] });
		await (closed.feature as unknown as { closeVorgangCmd: () => Promise<void> }).closeVorgangCmd();
		expect(lastNotice()).toContain("bereits abgeschlossen");
		expect(closed.app.fileManager.renamedTo).toEqual([]);
	});
});

describe("VorgangFeature.addDiaryEntryForSection", () => {
	it("emits 'Diary entry skipped' Notice when diary path is empty (TS-09)", async () => {
		const vorgang = createMockTFile("Vorgang.md");
		const app = createMockApp({});
		app.vault.register(vorgang, "");

		const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "" } }), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as {
			addDiaryEntryForSection: (file: typeof vorgang, name: string, date: Date) => Promise<void>;
		}).addDiaryEntryForSection(vorgang, "Section", new Date(2026, 1, 6));

		const notices = noticeMessages();
		expect(notices.some((n) => n.includes("Tagebucheintrag übersprungen"))).toBe(true);
		expect(notices.some((n) => n.includes("Tagebuch-Pfad"))).toBe(true);
	});
});
