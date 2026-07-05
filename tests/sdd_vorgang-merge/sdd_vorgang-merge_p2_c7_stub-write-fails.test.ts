import { describe, it, expect, beforeEach, vi } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockPlugin,
	createMockTFile,
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

const SOURCE_CONTENT = `---
tags: [Vorgang]
---

# Fakten und Pointer
- Eindeutiger Quell-Fakt XYZ

# Inhalt
`;

const TARGET_CONTENT = `---
tags: [Vorgang]
---

# Fakten und Pointer
- Ziel-Fakt

# Inhalt
`;

const DIARY_CONTENT = "---\n---\n\n---\n";

describe("SDD vorgang-merge p2 c7 — Stub-Schreiben der Quelle schlägt fehl", () => {
	it("resolves, keeps the merge on the target, shows the stub-failure Notice, and writes no diary entry", async () => {
		const app = createMockApp({});
		const source = createMockTFile("Vorgänge/Vorgang - Quelle.md");
		const target = createMockTFile("Vorgänge/Vorgang - Ziel.md");
		const diary = createMockTFile("Diary.md");
		app.vault.register(source, SOURCE_CONTENT);
		app.vault.register(target, TARGET_CONTENT);
		app.vault.register(diary, DIARY_CONTENT);
		app.workspace.activeFile = source;

		const plugin = createMockPlugin(makeTestSettings({ workDiary: { diaryNotePath: "Diary.md" } }), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		// vault.process on the SOURCE path throws (stub-write failure); the TARGET
		// call must still go through the real mock implementation and succeed.
		const originalProcess = app.vault.process;
		app.vault.process = vi.fn(async (file: MockTFile, fn: (content: string) => string): Promise<void> => {
			if (file.path === source.path) {
				throw new Error("Quelle blockiert");
			}
			return originalProcess(file, fn);
		});

		await expect(
			(feature as unknown as { mergeInto: (s: MockTFile, t: MockTFile) => Promise<void> }).mergeInto(source, target),
		).resolves.not.toThrow();

		// Target keeps the merge: the source's Fakten-Bullet must be present.
		expect(app.vault.files.get(target.path)).toContain("Eindeutiger Quell-Fakt XYZ");

		// Notice names the stub-write failure, including the error message.
		expect(lastNotice()).toContain("Ziel aktualisiert, aber Quelle konnte nicht gestubbt werden: ");
		expect(lastNotice()).toContain("Quelle blockiert");

		// No diary entry was written for the failed merge.
		expect(app.vault.files.get(diary.path)).toBe(DIARY_CONTENT);
		expect(noticeMessages().some((n) => n.includes("zusammengeführt"))).toBe(false);
	});
});
