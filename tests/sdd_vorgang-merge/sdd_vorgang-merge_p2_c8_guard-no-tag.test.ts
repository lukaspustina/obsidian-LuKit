import { describe, it, expect, beforeEach, vi } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockPlugin,
	createMockTFile,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

describe("SDD vorgang-merge p2 c8 — guard: source without target-note tag", () => {
	it("shows the guard Notice and never constructs the target picker", async () => {
		const active = createMockTFile("Vorgänge/Vorgang - Sonstiges.md");
		const app = createMockApp({});
		app.vault.register(active, "---\ntags: [Sonstiges]\n---\n");
		app.metadataCache.setFrontmatter(active.path, { tags: ["Sonstiges"] });
		app.workspace.activeFile = active;

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		const openMergeTargetPicker = vi.fn();
		(feature as unknown as { openMergeTargetPicker: typeof openMergeTargetPicker }).openMergeTargetPicker =
			openMergeTargetPicker;

		await (feature as unknown as { mergeVorgangCmd: () => void | Promise<void> }).mergeVorgangCmd();

		expect(lastNotice()).toContain("keine Zielnotiz");
		expect(openMergeTargetPicker).not.toHaveBeenCalled();
	});
});
