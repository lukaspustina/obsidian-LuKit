// Phase 4, criterion 5 (Test Scenarios #5):
// GIVEN two intake groups in the same Vorgang note — now one merged "note"
// stop carrying both groups (SDD triage-note-stops) — WHEN the first group is
// taken over via ⌘S (handleIntakeGroupOutcomes), THEN the stop's preview,
// read again for the same stop, reflects the freshly re-read note content,
// not the pre-walk snapshot (requirement 39a).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeItem } from "../../src/features/vorgang/intake-engine";
import type { TaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import { createMockApp, createMockTFile, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

function fakeBridge(overrides: Partial<TaskNotesBridge> = {}): TaskNotesBridge {
	return {
		availability: vi.fn(() => ({ ok: true }) as const),
		listTasks: vi.fn(async () => []),
		complete: vi.fn(async () => undefined),
		setScheduled: vi.fn(async () => undefined),
		toggleCompleteInstance: vi.fn(async () => undefined),
		toggleSkippedInstance: vi.fn(async () => undefined),
		readNote: vi.fn(async () => ""),
		openInNewTab: vi.fn(async () => undefined),
		...overrides,
	};
}

interface FeatureInternals {
	bridge: TaskNotesBridge;
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	loadPreview: (stop: TriageStop) => Promise<string>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

// Zwei sofort fällige (datumslose) Gruppen in derselben Vorgang-Notiz.
const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung A]]",
	"    - Angebot einholen",
	"- Aus [[Besprechung B]]",
	"    - Rückmeldung geben",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — fresh read per stop (SDD vorgang-next-steps p4 c5)", () => {
	it("shows the note stop's preview reflecting a ⌘S take-over, not the walk-start snapshot", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;
		internals.bridge = fakeBridge();

		const [groupA, groupB] = parseIntakeGroups(VORGANG);
		const noteStop: TriageStop = {
			kind: "note",
			notePath: vorgang.path,
			noteBasename: vorgang.basename,
			groups: [groupA, groupB],
		};

		internals.presentStop = vi.fn(async () => {}); // headless
		internals.walkActive = true;
		internals.stops = [noteStop];
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };

		const before = await internals.loadPreview(internals.stops[0]);
		expect(before).toContain("- Aus [[Besprechung A]]");
		expect(before).toContain("- Aus [[Besprechung B]]");

		// Gruppe A vollständig übernehmen (⌘S) — mutiert die Notiz und aktualisiert den Stop.
		const outcome: IntakeGroupOutcome = {
			lineIndex: groupA.lineIndex,
			discard: false,
			due: null,
			taken: [...groupA.ownItems] as IntakeItem[],
			keptOwn: [],
			keptForeign: [],
		};
		await internals.handleIntakeGroupOutcomes([outcome]);

		const after = await internals.loadPreview(internals.stops[0]);
		expect(after).not.toContain("- Aus [[Besprechung A]]");
		expect(after).toContain("- Angebot einholen");
		expect(after).not.toContain("    - Angebot einholen");
		expect(after).toContain("- Aus [[Besprechung B]]");
	});
});
