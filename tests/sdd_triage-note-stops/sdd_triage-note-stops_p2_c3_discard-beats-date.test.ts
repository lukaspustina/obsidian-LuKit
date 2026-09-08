// SDD: specs/sdd/triage-note-stops.md, Phase 2, Test Scenario #3:
// GIVEN a group section marked discard that also carries a date, WHEN
// confirmed, THEN the group and its lines are removed and no date is written
// anywhere.
//
// Per the Data Models section, `IntakeGroupOutcome.discard` wins over
// `taken`/`keptOwn`/`keptForeign`/`due` — discard must beat a date, not just
// an empty selection.
//
// RED today, but only half by accident: `handleIntakeGroupOutcomes`
// (task-triage-feature.ts) already special-cases `outcome.discard` and calls
// `dropGroup` — so the discarded group's own half of this test (group
// removed, its would-be date never written) already passes today, since
// `due` is entirely unwired in Phase 1 and `snoozeGroup` is never called for
// ANY group. That is exactly the trap named in the SDD: a naive
// implementation could special-case discard alone and still fail Requirement
// 13's "no date written" half for the wrong reason once due lands — this
// test also carries a second, non-discarded group with its own date, whose
// parent line must gain that date on the very same confirm. Since
// `snoozeGroup` is not called at all today, that second group's date is never
// written, and the test fails on that half — pinning both that discard wins
// AND that a sibling group's own date still gets applied in the same batch
// (Requirement 13).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroupOutcome } from "../../src/features/task-triage/intake-select-modal";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import { createMockApp, createMockTFile, createMockPlugin, makeTestSettings, asLuKitPlugin, resetNotices } from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang - Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang - Acme Kickoff";

// Two groups: the first is discarded and given a date (must win discard, no
// date written); the second is kept and given a date only (its parent line
// must gain that date on the very same confirm).
const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung - Kickoff]]",
	"    - Angebot prüfen",
	"    - Warte auf:",
	"        - Rechnung schicken",
	"",
	"- Aus [[Besprechung - Onboarding]]",
	"    - Vertrag unterschreiben",
	"",
	"# Inhalt",
	"",
].join("\n");

interface FeatureInternals {
	stops: TriageStop[];
	index: number;
	presentStop: () => Promise<void>;
	handleIntakeGroupOutcomes: (outcomes: IntakeGroupOutcome[]) => Promise<void>;
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile(NOTE_PATH, { basename: NOTE_BASENAME });
	app.vault.register(vorgang, VORGANG);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	const [group1, group2] = parseIntakeGroups(VORGANG);
	internals.presentStop = vi.fn(async () => {});
	internals.stops = [
		{
			kind: "note",
			notePath: vorgang.path,
			noteBasename: NOTE_BASENAME,
			groups: [group1, group2],
		} as unknown as TriageStop,
	];
	internals.index = 0;

	return { internals, app, vorgang, group1, group2 };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops Phase 2 #3: discard beats a group's own date", () => {
	it("removes the discarded group and its would-be date, while a sibling's own date is still written", async () => {
		const { internals, app, vorgang, group1, group2 } = setup();

		const discardedWithDate: IntakeGroupOutcome = {
			lineIndex: group1.lineIndex,
			discard: true,
			// A future date on the discarded group — must never reach the note.
			due: "2026-12-31",
			// Populated on purpose — discard must override these too, not just
			// an empty selection.
			taken: [{ text: "Angebot prüfen", children: [] }],
			keptOwn: [],
			keptForeign: [{ text: "Rechnung schicken", children: [] }],
		};
		const keptWithDate: IntakeGroupOutcome = {
			lineIndex: group2.lineIndex,
			discard: false,
			due: "2026-11-15",
			taken: [],
			keptOwn: [{ text: "Vertrag unterschreiben", children: [] }],
			keptForeign: [],
		};

		await internals.handleIntakeGroupOutcomes([discardedWithDate, keptWithDate]);

		const newContent = app.vault.files.get(vorgang.path) ?? "";

		// The discarded group is fully gone — parent line, own item and the
		// foreign one behind "Warte auf:" alike.
		expect(newContent).not.toContain("Besprechung - Kickoff");
		expect(newContent).not.toContain("Angebot prüfen");
		expect(newContent).not.toContain("Rechnung schicken");
		expect(newContent).not.toContain("Warte auf");

		// Its date — in every locale formatDate could have used it in — never
		// made it into the note. The discarded group's own date field is
		// deliberately not exercised for locales other than "de" here; the SDD
		// gates the whole date field behind `formatDate`/`parseDateString`
		// (src/shared/date-format.ts), and "de" is this test's fixed locale.
		expect(newContent).not.toContain("31.12.2026");
		expect(newContent).not.toContain("2026-12-31");

		// The kept sibling survives with its item intact, and its parent line
		// now carries the new date — this is the half that fails today, since
		// `snoozeGroup` is never invoked while `due` is unwired.
		expect(newContent).toContain("Vertrag unterschreiben");
		expect(newContent).toContain("Besprechung - Onboarding");
		expect(newContent).toContain("15.11.2026");

		const remaining = parseIntakeGroups(newContent);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].line).toBe("- Aus [[Besprechung - Onboarding]], 15.11.2026");
		expect(remaining[0].due).toEqual(new Date(2026, 10, 15));

		// The stop stays open — this is not the last group's business, only
		// its own removal is (a different Phase 2 criterion covers the
		// refresh withdrawing a now-future-dated group from the stop).
		expect(internals.index).toBe(0);
		expect(internals.presentStop).toHaveBeenCalled?.();
	});
});
