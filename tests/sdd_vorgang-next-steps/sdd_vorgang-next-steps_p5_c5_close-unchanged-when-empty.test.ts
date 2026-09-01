import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression guard, not a RED test: this scenario is expected to PASS already
// today, the same way sdd_vorgang-next-steps_p1_c2 and sdd_vorgang-merge's
// own regression scenarios do — the close guard (requirement 43) only ever
// blocks a NON-empty intake, so an empty one must behave exactly as
// `vorgang-close` already does. This test pins that current behaviour (see
// vorgang-feature.test.ts "sets the done tag, removes note_type, renames the
// file, and logs to the diary") so Phase 5's guard cannot regress it. Do not
// "fix" this test to match a future implementation; if it goes red, the
// empty-intake path regressed.
const { constructed } = vi.hoisted(() => ({
	constructed: [] as Array<{ message: string; onConfirm: () => void }>,
}));
vi.mock("../../src/shared/modals/confirm-modal", () => ({
	ConfirmModal: class {
		constructor(_app: unknown, message: string, onConfirm: () => void) {
			constructed.push({ message, onConfirm });
		}
		open(): void {}
	},
}));

import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// A "# Nächste Schritte" section with the boundary present but no group below
// it — an intake that exists structurally but is genuinely empty.
const VORGANG_WITH_EMPTY_INTAKE = [
	"---",
	"tags: [Vorgang]",
	"note_type: tasknote",
	"scheduled: 2026-07-06",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

describe("vorgang-close is unaffected by an empty intake (SDD vorgang-next-steps p5 c5)", () => {
	it("shows no confirmation and completes the close exactly as before", async () => {
		expect(parseIntakeGroups(VORGANG_WITH_EMPTY_INTAKE)).toHaveLength(0);

		const active = createMockTFile("Vorgänge/Vorgang - X.md");
		const app = createMockApp({});
		app.vault.register(active, VORGANG_WITH_EMPTY_INTAKE);
		app.metadataCache.setFrontmatter(active.path, { tags: ["Vorgang"], note_type: "tasknote", scheduled: "2026-07-06" });
		app.fileManager.frontmatter.set(active.path, { tags: ["Vorgang"], note_type: "tasknote", scheduled: "2026-07-06" });
		app.workspace.activeFile = active;

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		const diary = createMockTFile("Diary.md");
		app.vault.register(diary, "---\n---\n\n---\n");
		plugin.settings.workDiary.diaryNotePath = "Diary.md";

		await (feature as unknown as { closeVorgangCmd: () => Promise<void> }).closeVorgangCmd();

		// No confirmation prompt for an empty intake.
		expect(constructed).toHaveLength(0);

		// Existing behaviour, unchanged: doneTag set, note_type removed, renamed,
		// diary entry logged.
		const fm =
			app.fileManager.frontmatter.get("Vorgänge/Vorgang - X - done.md") ??
			app.fileManager.frontmatter.get("Vorgänge/Vorgang - X.md");
		expect(fm?.tags).toEqual(["Vorgang", "Done"]);
		expect(fm?.note_type).toBeUndefined();
		expect(fm?.scheduled).toBe("2026-07-06");
		expect(app.fileManager.renamedTo).toEqual(["Vorgänge/Vorgang - X - done.md"]);
		expect(active.basename).toBe("Vorgang - X - done");
		expect(app.vault.files.get("Diary.md")).toContain("- [[Vorgang - X - done]] abgeschlossen");
	});
});
