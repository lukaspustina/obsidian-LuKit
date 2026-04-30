import { describe, it, expect, beforeEach } from "vitest";
import { WorkDiaryFeature } from "../../src/features/work-diary/work-diary-feature";
import {
	createMockApp,
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

describe("WorkDiaryFeature.addCurrentNoteCmd", () => {
	it("emits Notice when no diary file is configured", async () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "" } }), app);
		const feature = new WorkDiaryFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { addCurrentNoteCmd: () => Promise<void> }).addCurrentNoteCmd();
		expect(lastNotice()).toContain("No diary note path configured");
	});

	it("emits 'No active note open' Notice when there is no active file", async () => {
		const diary = createMockTFile("Diary.md");
		const app = createMockApp({});
		app.vault.register(diary, "");
		const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "Diary.md" } }), app);
		const feature = new WorkDiaryFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { addCurrentNoteCmd: () => Promise<void> }).addCurrentNoteCmd();
		expect(lastNotice()).toContain("No active note open");
	});

	it("rejects adding the diary note to itself", async () => {
		const diary = createMockTFile("Diary.md");
		const app = createMockApp({});
		app.vault.register(diary, "");
		app.workspace.activeFile = diary;
		const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "Diary.md" } }), app);
		const feature = new WorkDiaryFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { addCurrentNoteCmd: () => Promise<void> }).addCurrentNoteCmd();
		expect(lastNotice()).toContain("Cannot add the diary note to itself");
	});
});
