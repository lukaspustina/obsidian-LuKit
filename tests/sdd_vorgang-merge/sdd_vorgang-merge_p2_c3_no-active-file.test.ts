import { describe, it, expect, beforeEach, vi } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
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

describe("SDD vorgang-merge p2 c3 — no active note", () => {
	it("emits a German Notice and never constructs the merge target picker when there is no active file", () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		const spy = vi.fn();
		(feature as unknown as Record<string, unknown>).openMergeTargetPicker = spy;

		(feature as unknown as { mergeVorgangCmd: () => void | Promise<void> }).mergeVorgangCmd();

		expect(lastNotice()).toContain("Keine aktive Notiz");
		expect(spy).not.toHaveBeenCalled();
	});
});
