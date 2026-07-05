import { describe, it, expect, beforeEach, vi } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
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

describe("SDD vorgang-merge p2 c9 — guard: already-done source", () => {
	it("shows 'bereits abgeschlossen' Notice and never opens the merge-target picker", () => {
		const active = createMockTFile("Vorgänge/Vorgang - X.md");
		const app = createMockApp({});
		app.vault.register(active, "");
		app.workspace.activeFile = active;
		app.metadataCache.setFrontmatter(active.path, { tags: ["Vorgang", "Done"] });

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		const openMergeTargetPicker = vi.fn();
		(feature as unknown as { openMergeTargetPicker: typeof openMergeTargetPicker }).openMergeTargetPicker =
			openMergeTargetPicker;

		(feature as unknown as { mergeVorgangCmd: () => void | Promise<void> }).mergeVorgangCmd();

		expect(lastNotice()).toContain("bereits abgeschlossen");
		expect(openMergeTargetPicker).not.toHaveBeenCalled();
	});
});
