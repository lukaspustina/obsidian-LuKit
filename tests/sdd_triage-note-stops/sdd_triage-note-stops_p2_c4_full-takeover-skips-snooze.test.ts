// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #4 / Requirement
// 13, Decision Log row "Per-group take-over + date compose as
// take-over-then-snooze, with snooze skipped when the group is fully removed":
// GIVEN a group section fully taken over (nothing kept) that also carries a
// date, WHEN confirmed, THEN only takeOverGroup runs for that group (the
// group is removed) and snoozeGroup is skipped — no missing-parent-line
// failure is reported and no date is written.
//
// This is the regression guard against the naive alternative the Decision Log
// rejects: invoking snoozeGroup unconditionally and treating a full
// take-over's now-missing parent line as a mutation failure. Today's
// handleIntakeGroupOutcomes (Phase 1) never calls snoozeGroup at all — it only
// threads discard/takeOverGroup through IntakeGroupOutcome and ignores `due`
// entirely — so the first group's assertions already hold by accident. The
// second group (kept in full, with its own date) is what makes this file RED
// today: nothing in Phase 1 rewrites its parent line with the new date, since
// snoozeGroup is never invoked for any group yet. Phase 2 must make both
// groups behave correctly in the same batch.

import { describe, it, expect, vi, beforeEach } from "vitest";
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
	noticeMessages,
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

// Two groups on one note: Kickoff is fully taken over (nothing kept) and also
// carries a date on this confirm — the case Requirement 13 says must skip
// snoozeGroup entirely. Review keeps everything and also carries a date — the
// ordinary snooze-while-kept case, included so both paths run in one batch and
// so the file fails today (Phase 1 ignores `due` for every group, not just
// the fully-removed one).
const NOTE = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Kickoff]]",
	"    - Angebot prüfen",
	"    - Termin vereinbaren",
	"",
	"- Aus [[Besprechung - Review]]",
	"    - Rechnung schicken",
	"",
	"# Inhalt",
	"",
].join("\n");

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	presentStop: () => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	app.vault.register(vorgang, NOTE);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// Built through the real join point (selectNoteStops), per the p1_c10
	// convention, so the note stop carries exactly what the walk would build.
	const candidates: IntakeStopCandidate[] = parseIntakeGroups(NOTE).map((group) => ({
		group,
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
	}));
	const noteStops = selectNoteStops([], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #4: a fully taken-over group with a date skips snoozeGroup", () => {
	it("removes the fully taken-over group without invoking snooze, and still snoozes the sibling group that keeps its lines", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { internals, app, vorgang } = setup();
		const [groupKickoff, groupReview] = parseIntakeGroups(NOTE);

		// Kickoff: every line ticked (full take-over, nothing kept) AND a date —
		// the composed case Requirement 13 singles out: takeOverGroup runs,
		// snoozeGroup must be skipped because nothing is left to snooze.
		const kickoffOutcome: IntakeGroupOutcome = {
			lineIndex: groupKickoff.lineIndex,
			discard: false,
			due: "2026-09-15",
			taken: [...groupKickoff.ownItems],
			keptOwn: [],
			keptForeign: [],
		};
		// Review: nothing ticked, so the group survives — and carries its own
		// date, which snoozeGroup must apply to its (still-present) parent line.
		const reviewOutcome: IntakeGroupOutcome = {
			lineIndex: groupReview.lineIndex,
			discard: false,
			due: "2026-09-20",
			taken: [],
			keptOwn: [...groupReview.ownItems],
			keptForeign: [],
		};

		await internals.handleIntakeGroupOutcomes([kickoffOutcome, reviewOutcome]);

		// No mutation-failure Notice anywhere — a naive "always call snoozeGroup"
		// implementation would resolve Kickoff's now-missing parent line to null
		// and abort the whole batch with "Aktion fehlgeschlagen — Eintrag bleibt
		// offen.".
		expect(noticeMessages()).toHaveLength(0);
		expect(consoleErrorSpy).not.toHaveBeenCalled();

		const finalContent = app.vault.files.get(vorgang.path) ?? "";

		// Kickoff's date never lands anywhere in the note — the group it would
		// have been written onto is gone.
		expect(finalContent).not.toContain("15.09.2026");
		expect(finalContent).not.toContain("2026-09-15");

		const remaining = parseIntakeGroups(finalContent);

		// Kickoff is fully removed; only Review is left.
		expect(remaining).toHaveLength(1);
		expect(remaining[0].source).toBe("Besprechung - Review");

		// Review's lines are untouched, and its parent line now carries the new
		// date via snoozeGroup — proving the sibling group's snooze actually ran
		// in the same batch as Kickoff's skipped one.
		expect(remaining[0].ownItems).toEqual(groupReview.ownItems);
		expect(remaining[0].line).toContain("20.09.2026");
		expect(remaining[0].due).not.toBeNull();

		// The walk returned to the same (refreshed) stop rather than aborting.
		expect(internals.presentStop).toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});
});
