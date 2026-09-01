import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every ConfirmModal construction so the test can drive (or withhold)
// the user's decision without depending on Modal.open() actually rendering —
// the obsidian-stub's Modal.open() is a no-op, so onOpen() never runs under
// test. Same recording-stub pattern as besprechung-suggestions.test.ts and
// the Phase 4 intake-select-modal tests.
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
import type { MockTFile } from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 5, Test Scenario 4 / Requirement 43:
// `vorgang-close` blocks on a non-empty intake — parseIntakeGroups(content).length
// > 0, regardless of item count — behind a ConfirmModal that is the FIRST
// check, before any mutation. Declining (not confirming) leaves the note
// byte-identical: no doneTag, no rename, no diary entry. A zero-item
// placeholder group (⌘K's group, requirement 19) still counts as non-empty.
//
// `closeVorgangCmd` does not check the intake at all yet, so it proceeds
// straight to the existing doneTag/rename/diary writes without ever
// constructing a ConfirmModal — `constructed` stays empty and the first
// assertion fails. The correct RED, not a syntax error.

const VORGANG_WITH_INTAKE = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung Acme Kickoff]]",
	"    - Angebot einholen",
	"",
	"# Inhalt",
	"",
].join("\n");

// A group with no items at all — the ⌘K placeholder case. Still one group,
// so parseIntakeGroups(...).length > 0 holds.
const VORGANG_WITH_PLACEHOLDER_INTAKE = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[#E-Mail-Thread: Angebot, 01.09.2026]]",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

function setupClose(content: string) {
	const active = createMockTFile("Vorgänge/Vorgang - X.md");
	const app = createMockApp({});
	app.vault.register(active, content);
	app.metadataCache.setFrontmatter(active.path, { tags: ["Vorgang"] });
	app.fileManager.frontmatter.set(active.path, { tags: ["Vorgang"] });
	app.workspace.activeFile = active;

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new VorgangFeature();
	feature.onload(asLuKitPlugin(plugin));

	const diary = createMockTFile("Diary.md");
	app.vault.register(diary, "---\n---\n\n---\n");
	plugin.settings.workDiary.diaryNotePath = "Diary.md";

	return { app, plugin, feature, active: active as MockTFile, diary };
}

describe("vorgang-close is blocked by a non-empty intake until confirmed (SDD vorgang-next-steps p5 c4)", () => {
	it("requires confirmation before any write, and declining leaves the note byte-identical", async () => {
		const { app, feature, active, diary } = setupClose(VORGANG_WITH_INTAKE);
		expect(parseIntakeGroups(VORGANG_WITH_INTAKE).length).toBeGreaterThan(0);

		await (feature as unknown as { closeVorgangCmd: () => Promise<void> }).closeVorgangCmd();

		// Confirmation is the first check — reached before any mutation.
		expect(constructed).toHaveLength(1);

		// Declining: the confirm callback is never invoked. Nothing was written.
		expect(app.vault.files.get(active.path)).toBe(VORGANG_WITH_INTAKE);
		expect(app.fileManager.renamedTo).toEqual([]);
		const fm = app.fileManager.frontmatter.get(active.path);
		expect(fm?.tags).toEqual(["Vorgang"]);
		expect(app.vault.files.get(diary.path)).not.toContain("abgeschlossen");
	});

	it("blocks on a zero-item placeholder group too — item count does not exempt it", async () => {
		const { app, feature, active } = setupClose(VORGANG_WITH_PLACEHOLDER_INTAKE);
		const groups = parseIntakeGroups(VORGANG_WITH_PLACEHOLDER_INTAKE);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems).toHaveLength(0);
		expect(groups[0].foreignItems).toHaveLength(0);

		await (feature as unknown as { closeVorgangCmd: () => Promise<void> }).closeVorgangCmd();

		expect(constructed).toHaveLength(1);
		expect(app.vault.files.get(active.path)).toBe(VORGANG_WITH_PLACEHOLDER_INTAKE);
		expect(app.fileManager.renamedTo).toEqual([]);
	});
});
