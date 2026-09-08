// Supersedes part of tests/acceptance/intake-partial-takeover.test.ts (groupDone, sibling carry-over).
// SDD: specs/sdd/triage-note-stops.md, Phase 1, Test Scenario #12 / Requirement
// 14: GIVEN a note stop whose only group is fully taken over via ⌘S, WHEN the
// stop refreshes, THEN `groups` is empty and ⌘S disappears from the key bar
// without the walk advancing.
//
// This supersedes the `groupDone` flag of
// specs/done/sdd/vorgang-next-steps-2026-09-02.md: that SDD kept a
// worked-off group's stop alive by flagging `IntakeStop.groupDone = true`
// (the group gone, the stale `group` left on the stop) and pulling a
// sibling group from a later stop of the same note into its place via
// `takeSiblingIntakeGroup`. Under this SDD there is one stop per note that
// already carries every one of its due groups at once
// (`NoteStop.groups: IntakeGroup[]`), so a fully-worked note simply
// refreshes to an empty `groups` array — no `groupDone` flag, no
// stop-stealing, and no successor stop to remove from the walk.
//
// RED today because: `TriageStop` has no `"note"` kind yet (Requirement
// 1/18 — `task-triage-engine.ts` still distinguishes `"task"` and
// `"intake"`), and `TaskTriageFeature.refreshIntakeStop`
// (`task-triage-feature.ts:508-521`) still reads the old shape's singular
// `stop.group.line` rather than `NoteStop.groups`. Calling it with a
// `NoteStop`-shaped stop (this SDD's Data Models section) throws instead of
// recomputing `groups`.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { TaskTriageModal } from "../../src/features/task-triage/task-triage-modal";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import { __allTexts } from "../helpers/obsidian-stub";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang - Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang - Acme Kickoff";

// The note as it stands once ⌘S's confirm has already fully taken over the
// stop's only group and committed the write: the boundary remains, empty.
const NOTE_AFTER_FULL_TAKEOVER = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"",
	"# Inhalt",
	"",
].join("\n");

function group(overrides: Partial<IntakeGroup> = {}): IntakeGroup {
	return {
		line: "- Aus [[Besprechung - Kickoff]]",
		source: "Besprechung - Kickoff",
		due: null,
		ownItems: [{ text: "Angebot prüfen", children: [] }],
		foreignItems: [],
		lineIndex: 7,
		...overrides,
	};
}

// A NoteStop as this SDD's Data Models section defines it (kind: "note",
// groups: IntakeGroup[]). Not part of TriageStop yet — cast past today's
// union, the same forward-reference convention used by
// sdd_triage-note-stops_p1_c3/c4.
function noteStop(groups: IntakeGroup[]): TriageStop {
	return {
		kind: "note",
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
		groups,
	} as unknown as TriageStop;
}

interface FeatureInternals {
	stops: TriageStop[];
	index: number;
	refreshIntakeStop: (stop: TriageStop) => Promise<void>;
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	app.vault.register(vorgang, NOTE_AFTER_FULL_TAKEOVER);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// A second stop on an unrelated note, so an accidental removal of the
	// refreshed stop (rather than an in-place update) would show up as a
	// length change — and, being a different note, it cannot be mistaken by
	// the superseded sibling-stealing mechanic (see file header) for a
	// successor group of this stop's note.
	internals.stops = [
		noteStop([group()]),
		{
			kind: "note",
			notePath: "Vorgänge/Vorgang - Other.md",
			noteBasename: "Vorgang - Other",
			groups: [group({ lineIndex: 30 })],
		} as unknown as TriageStop,
	];
	internals.index = 0;
	return { internals, app, vorgang };
}

function keyBarTexts(stop: TriageStop): string[] {
	const modal = new TaskTriageModal(createMockApp({}) as never, {
		stop,
		actions: { snooze: false, skipInstance: false },
		locale: "de",
		today: "2026-09-08",
		position: { index: 0, total: 2 },
		sourcePath: NOTE_PATH,
		onComplete: () => undefined,
		onSnooze: () => undefined,
		onSnoozeCustom: () => undefined,
		onSkipInstance: () => undefined,
		onIntakeDiscard: () => undefined,
		onIntakeSelect: () => undefined,
		onIntakeNoteDate: () => undefined,
		onOpenAndStop: () => undefined,
		onSkip: () => undefined,
		onStop: () => undefined,
	});
	(modal as unknown as { renderInstructions: () => void }).renderInstructions();
	return __allTexts((modal as unknown as { contentEl: unknown }).contentEl);
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 1 #12: note stop refreshes to zero groups after a full take-over", () => {
	it("empties groups, keeps the walk on the same stop, and withdraws ⌘S while keeping the note's own actions", async () => {
		const { internals } = setup();
		const staleStop = internals.stops[0];

		await internals.refreshIntakeStop(staleStop);

		const refreshed = internals.stops[0] as unknown as { groups: IntakeGroup[] };
		expect(refreshed.groups).toEqual([]);
		// No advance: still on stop 0, the walk still has both its stops.
		expect(internals.index).toBe(0);
		expect(internals.stops).toHaveLength(2);

		const texts = keyBarTexts(internals.stops[0]);
		expect(texts).not.toContain("⌘S");
		// The note's own actions survive — a stop with zero groups is not a
		// dead end.
		expect(texts).toContain("↵");
		expect(texts).toContain("esc");
		expect(texts).toContain("⌘.");
	});
});
