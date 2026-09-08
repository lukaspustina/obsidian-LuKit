// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #2 / Requirement 13:
// GIVEN a group section with both a date set and some lines ticked, WHEN
// confirmed, THEN the ticked lines move into the curated part and the
// remaining (rewritten) group's parent line carries the new date.
//
// This pins the take-over-then-snooze order from the Decision Log ("Per-group
// take-over + date compose as take-over-then-snooze, with snooze skipped when
// the group is fully removed"): a partial take-over keeps the group (some
// lines stay behind), so unlike the full-take-over case, snoozeGroup DOES run
// afterward and must land on the rewritten group's parent line, not on a
// stale one.
//
// This is the intended RED state: today's handleIntakeGroupOutcomes
// (src/features/task-triage/task-triage-feature.ts) builds only
// { taken, keptOwn, keptForeign } for takeOverGroup and never calls
// snoozeGroup — IntakeGroupOutcome.due is accepted by the type but ignored at
// runtime (per intake-select-modal.ts's own comment: "The date field itself
// ships in Phase 2, so this is always null today"). So the group's parent
// line keeps its original (missing) date instead of carrying the new one.

import { describe, it, expect, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import { selectNoteStops } from "../../src/features/task-triage/task-triage-engine";
import type { TriageStop, IntakeStopCandidate } from "../../src/features/task-triage/task-triage-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import { formatDate } from "../../src/shared/date-format";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";
// Well past "today" for any plausible test run — the point under test is
// which date lands on the line, not the due-filtering that keeps it off a
// fresh walk.
const NEW_DUE_ISO = "2026-09-20";

const ONE_GROUP = [
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
	app.vault.register(vorgang, ONE_GROUP);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	// Built through the real join point, as the p1_c10 convention establishes,
	// so the note stop carries exactly what selectNoteStops produces.
	const candidates: IntakeStopCandidate[] = parseIntakeGroups(ONE_GROUP).map((group) => ({
		group,
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
	}));
	const noteStops = selectNoteStops([], candidates);
	internals.stops = noteStops.map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.walkActive = true;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #2: ⌘S confirm with a date AND a partial take-over on the same group", () => {
	it("moves ticked lines into the curated part and stamps the rewritten group's parent line with the new date", async () => {
		const { internals, app, vorgang } = setup();
		const [group] = parseIntakeGroups(ONE_GROUP);

		// Ticked: "Angebot prüfen" moves out. Kept: "Termin vereinbaren" stays,
		// and the group's own parent line also gets a new due date.
		const outcome: IntakeGroupOutcome = {
			lineIndex: group.lineIndex,
			discard: false,
			due: NEW_DUE_ISO,
			taken: [group.ownItems[0]],
			keptOwn: [group.ownItems[1]],
			keptForeign: [],
		};

		await internals.handleIntakeGroupOutcomes([outcome]);

		const finalContent = app.vault.files.get(vorgang.path) ?? "";
		const lines = finalContent.split("\n");
		const boundaryIndex = lines.findIndex((l) => l.trim() === "#### Unsortiert");

		// 1) The ticked line is above the "#### Unsortiert" boundary — moved
		// into the curated part.
		const takenIndex = lines.indexOf("- Angebot prüfen");
		expect(takenIndex).toBeGreaterThan(-1);
		expect(takenIndex).toBeLessThan(boundaryIndex);

		const remaining = parseIntakeGroups(finalContent);
		expect(remaining).toHaveLength(1);

		// 2) The kept line is still in the (rewritten) group.
		expect(remaining[0].ownItems).toEqual([group.ownItems[1]]);
		expect(remaining[0].foreignItems).toEqual([]);
		// Rendered as a sub-bullet of the (rewritten) group, indented as
		// intake-engine's renderGroup always writes own items.
		expect(lines.indexOf("    - Termin vereinbaren")).toBeGreaterThan(boundaryIndex);

		// 3) The group's parent line carries the new date — take-over-then-
		// snooze order: the rewritten line from takeOverGroup, not the stale
		// pre-take-over one, is what snoozeGroup stamps.
		const expectedSuffix = formatDate(new Date(2026, 8, 20), "de");
		expect(remaining[0].line).toBe(`- Aus [[Besprechung - Kickoff]], ${expectedSuffix}`);
		expect(remaining[0].due).not.toBeNull();
		expect(remaining[0].due !== null && formatDate(remaining[0].due, "de")).toBe(expectedSuffix);
	});
});
