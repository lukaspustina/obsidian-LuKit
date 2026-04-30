import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import { createMockApp, createMockTFile, lastNotice, noticeMessages, resetNotices } from "../helpers/obsidian-mocks";
import type { LuKitSettings } from "../../src/types";

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

describe("VorgangFeature.addVorgangSectionCmd", () => {
	it("emits 'No active note open' Notice when there is no active file", () => {
		const app = createMockApp({});
		const plugin = { settings: { ...baseSettings }, app, features: [], addCommand: () => undefined };
		const feature = new VorgangFeature();
		feature.onload(plugin as never);

		(feature as unknown as { addVorgangSectionCmd: () => void }).addVorgangSectionCmd();

		expect(lastNotice()).toContain("No active note open");
	});
});

describe("VorgangFeature.addDiaryEntryForSection", () => {
	it("emits 'Diary entry skipped' Notice when diary path is empty (TS-09)", async () => {
		const vorgang = createMockTFile("Vorgang.md");
		const app = createMockApp({});
		app.vault.register(vorgang, "");

		const plugin = { settings: { ...baseSettings }, app, features: [], addCommand: () => undefined };
		const feature = new VorgangFeature();
		feature.onload(plugin as never);

		await (feature as unknown as {
			addDiaryEntryForSection: (file: typeof vorgang, name: string, date: Date) => Promise<void>;
		}).addDiaryEntryForSection(vorgang, "Section", new Date(2026, 1, 6));

		const notices = noticeMessages();
		expect(notices.some((n) => n.includes("Diary entry skipped"))).toBe(true);
		expect(notices.some((n) => n.includes("Diary note path"))).toBe(true);
	});
});
