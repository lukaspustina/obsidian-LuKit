import { describe, it, expect, beforeEach } from "vitest";
import { WorkDiaryFeature } from "../../src/features/work-diary/work-diary-feature";
import { createMockApp, createMockTFile, lastNotice, resetNotices } from "../helpers/obsidian-mocks";
import type { LuKitSettings } from "../../src/types";

const baseSettings: LuKitSettings = {
	dateLocale: "de",
	workDiary: { diaryNotePath: "Diary.md" },
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

describe("WorkDiaryFeature.addCurrentNoteCmd", () => {
	it("emits Notice when no diary file is configured", async () => {
		const app = createMockApp({});
		const plugin = {
			settings: { ...baseSettings, workDiary: { diaryNotePath: "" } },
			app,
			features: [],
			addCommand: () => undefined,
		};
		const feature = new WorkDiaryFeature();
		feature.onload(plugin as never);

		await (feature as unknown as { addCurrentNoteCmd: () => Promise<void> }).addCurrentNoteCmd();
		expect(lastNotice()).toContain("No diary note path configured");
	});

	it("emits 'No active note open' Notice when there is no active file", async () => {
		const diary = createMockTFile("Diary.md");
		const app = createMockApp({});
		app.vault.register(diary, "");
		const plugin = { settings: { ...baseSettings }, app, features: [], addCommand: () => undefined };
		const feature = new WorkDiaryFeature();
		feature.onload(plugin as never);

		await (feature as unknown as { addCurrentNoteCmd: () => Promise<void> }).addCurrentNoteCmd();
		expect(lastNotice()).toContain("No active note open");
	});

	it("rejects adding the diary note to itself", async () => {
		const diary = createMockTFile("Diary.md");
		const app = createMockApp({});
		app.vault.register(diary, "");
		app.workspace.activeFile = diary;
		const plugin = { settings: { ...baseSettings }, app, features: [], addCommand: () => undefined };
		const feature = new WorkDiaryFeature();
		feature.onload(plugin as never);

		await (feature as unknown as { addCurrentNoteCmd: () => Promise<void> }).addCurrentNoteCmd();
		expect(lastNotice()).toContain("Cannot add the diary note to itself");
	});
});
