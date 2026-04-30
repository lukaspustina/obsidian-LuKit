import { describe, it, expect, beforeEach } from "vitest";
import { MigrationFeature } from "../../src/features/migration/migration-feature";
import {
	createMockApp,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

describe("MigrationFeature.migrateCmd", () => {
	it("emits 'No active note open' Notice when there is no active file", async () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new MigrationFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (feature as unknown as { migrateCmd: () => Promise<void> }).migrateCmd();
		expect(lastNotice()).toContain("No active note open");
	});
});
