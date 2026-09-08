// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #1 / Requirements 12, 13:
// GIVEN a group section with a date set to next week and no lines ticked or
// discarded, WHEN confirmed, THEN snoozeGroup rewrites only the "- Aus …"
// parent line's trailing date; sub-bullets are byte-identical.
//
// This is the intended RED state: Phase 1 shipped IntakeGroupOutcome.due as a
// field the feature reads but never acts on — handleIntakeGroupOutcomes calls
// only takeOverGroup/dropGroup per outcome, never snoozeGroup. So today, an
// outcome carrying a future `due` with nothing ticked leaves the group's
// parent line byte-identical to before (no date appended), which is exactly
// what this test asserts must NOT be the case once Phase 2 wires `due`
// through to snoozeGroup.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, IntakeStopCandidate } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// dateLocale defaults to "de" (DEFAULT_SETTINGS.dateLocale) — no override here,
// matching the plugin's default German formatting for the expected suffix.
const TODAY = "2026-09-08";
const NEXT_WEEK_ISO = "2026-09-15";
const NEXT_WEEK_DE = "15.09.2026";
const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

const PARENT_LINE = "- Aus [[Besprechung - Kickoff]]";
const CHILD_1 = "    - Angebot prüfen";
const CHILD_2 = "    - Termin vereinbaren";

const ONE_GROUP = ["---", "tags: [Vorgang]", "---", "", "# Nächste Schritte", "", "#### Unsortiert", PARENT_LINE, CHILD_1, CHILD_2, "", "# Inhalt", ""].join(
	"\n",
);

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	app.vault.register(vorgang, ONE_GROUP);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// Built through the real join point (selectNoteStops), per the
	// p1_c10 convention, so the note stop carries exactly what the walk
	// itself would produce.
	const candidates: IntakeStopCandidate[] = parseIntakeGroups(ONE_GROUP).map((group) => ({
		group,
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
	}));
	const noteStops = selectNoteStops([], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.presentStop = async () => {};
	internals.walkActive = true;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #1: a group's own date-only snooze via ⌘S confirm", () => {
	it("rewrites only the group's parent line with the new date; sub-bullets stay byte-identical", async () => {
		const { internals, app, vorgang } = setup();
		const [group] = parseIntakeGroups(ONE_GROUP);
		expect(group.line).toBe(PARENT_LINE);

		// Nothing ticked, nothing discarded — everything the group already has
		// stays kept; only a due date is set.
		const outcome: IntakeGroupOutcome = {
			lineIndex: group.lineIndex,
			discard: false,
			due: NEXT_WEEK_ISO,
			taken: [],
			keptOwn: [...group.ownItems],
			keptForeign: [...group.foreignItems],
		};

		await internals.handleIntakeGroupOutcomes([outcome]);

		const finalContent = app.vault.files.get(vorgang.path) ?? "";
		const lines = finalContent.split("\n");

		// The parent line now carries the new date — this is the assertion that
		// fails today, since `due` is not yet wired to snoozeGroup and the line
		// comes back unchanged.
		expect(lines).toContain(`${PARENT_LINE}, ${NEXT_WEEK_DE}`);
		expect(lines).not.toContain(PARENT_LINE);

		// Sub-bullets are byte-identical to before the confirm.
		expect(lines).toContain(CHILD_1);
		expect(lines).toContain(CHILD_2);

		// Exactly one group still parses, with the new due date and its items
		// untouched — snoozeGroup only rewrites the parent line.
		const remaining = parseIntakeGroups(finalContent);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].source).toBe(group.source);
		expect(remaining[0].ownItems).toEqual(group.ownItems);
		expect(remaining[0].foreignItems).toEqual(group.foreignItems);
		expect(remaining[0].due).toEqual(new Date(2026, 8, 15));
	});
});
