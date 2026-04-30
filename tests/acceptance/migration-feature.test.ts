import { describe, it, expect, beforeEach } from "vitest";
import { MigrationFeature } from "../../src/features/migration/migration-feature";
import { createMockApp, lastNotice, resetNotices } from "../helpers/obsidian-mocks";
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

describe("MigrationFeature.migrateCmd", () => {
	it("emits 'No active note open' Notice when there is no active file", async () => {
		const app = createMockApp({});
		const plugin = { settings: { ...baseSettings }, app, features: [], addCommand: () => undefined };
		const feature = new MigrationFeature();
		feature.onload(plugin as never);

		await (feature as unknown as { migrateCmd: () => Promise<void> }).migrateCmd();
		expect(lastNotice()).toContain("No active note open");
	});
});
