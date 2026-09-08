// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #8 / Requirement 13:
// GIVEN a note stop with two groups, WHEN confirming causes the second group's
// mutation to report its parent line missing, THEN nothing from either
// group's mutation is written, a German Notice is shown, and the walk remains
// on the stop.
//
// RED-state check: today's handleIntakeGroupOutcomes already threads outcomes
// sequentially through one vault.process callback and aborts the whole batch
// when any group's engine call returns null (the takeOverGroup/dropGroup
// path). This test pins that all-or-nothing guarantee still holds once
// Requirement 13's second engine call (snoozeGroup) is wired in: the second
// group here carries a `due` (the date path) on top of being missing, so a
// Phase 2 implementation that mis-orders or skips the null-check around its
// added snoozeGroup call — e.g. writing the batch before resolving every
// group, or treating a stale snoozeGroup separately from takeOverGroup's
// abort — would break this. See obsidian-mocks.ts's lastNotice/resetNotices.

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
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";
const FUTURE_DATE_ISO = "2099-01-15";

// The stop's own view: two groups, as the walk parsed them earlier.
const TWO_GROUPS = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Kickoff]]",
	"    - Angebot prüfen",
	"",
	"- Aus [[Besprechung - Review]]",
	"    - Rechnung schicken",
	"",
	"# Inhalt",
	"",
].join("\n");

// The note as it actually stands on disk when the confirm runs: the second
// group ("Review") was already removed — by a hand edit, or a sibling stop's
// own mutation earlier in the same walk (the p4_c11 precedent) — so its
// parent line is not there for either takeOverGroup or snoozeGroup to find.
const ON_DISK = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Kickoff]]",
	"    - Angebot prüfen",
	"",
	"# Inhalt",
	"",
].join("\n");

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
	// Registered content is what handleIntakeGroupOutcomes actually reads and
	// writes — the already-shrunk version, distinct from the stop's groups.
	app.vault.register(vorgang, ON_DISK);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// The stop carries both groups, parsed from the pre-removal content — this
	// mirrors a walk that read the note once, before something else removed
	// the second group.
	const candidates: IntakeStopCandidate[] = parseIntakeGroups(TWO_GROUPS).map((group) => ({
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

describe("SDD triage-note-stops Phase 2 #8: ⌘S confirm aborts the whole batch when a group's line is missing", () => {
	it("writes nothing from either group, shows a Notice, and keeps the walk on the stop", async () => {
		const { internals, app, vorgang } = setup();
		const [groupKickoff, groupReview] = parseIntakeGroups(TWO_GROUPS);

		// The first group's mutation would visibly change the note: a full
		// take-over, moving its item out and removing the group.
		const kickoffOutcome: IntakeGroupOutcome = {
			lineIndex: groupKickoff.lineIndex,
			discard: false,
			due: null,
			taken: [...groupKickoff.ownItems],
			keptOwn: [],
			keptForeign: [],
		};
		// The second group no longer exists on disk. It also carries a `due`,
		// so the batch's abort must hold on the date path too, not only on a
		// take-over/discard.
		const reviewOutcome: IntakeGroupOutcome = {
			lineIndex: groupReview.lineIndex,
			discard: false,
			due: FUTURE_DATE_ISO,
			taken: [],
			keptOwn: [...groupReview.ownItems],
			keptForeign: [...groupReview.foreignItems],
		};

		await internals.handleIntakeGroupOutcomes([kickoffOutcome, reviewOutcome]);

		// Nothing written at all — not even the Kickoff group's own visible
		// change — because the batch is all-or-nothing.
		expect(app.vault.files.get(vorgang.path)).toBe(ON_DISK);

		expect(lastNotice()).toBeTruthy();
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
	});
});
