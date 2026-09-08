// Found by the correctness pass over a9fb6b0, after rows were changed to start
// unticked: an itemless group — what ⌘K on an email filing writes, and dateless
// so it is always due — has no rows to tick, so an untouched section yields
// empty arrays throughout. takeOverGroup reads that as "nothing was kept" and
// deletes the group's line, which is the one thing an untouched confirm must
// not do. A group whose rows were all emptied by hand is the opposite case: it
// had items, and removing it is the point.

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
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

// One itemless group (the ⌘K shape) beside one that has items.
const NOTE = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[#E-Mail-Thread Acme, 08.09.2026]]",
	"",
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
	app.vault.register(vorgang, NOTE);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	const candidates: IntakeStopCandidate[] = parseIntakeGroups(NOTE).map((group) => ({
		group,
		notePath: NOTE_PATH,
		noteBasename: NOTE_BASENAME,
	}));
	internals.stops = selectNoteStops([], candidates).map((s) => ({ kind: "note" as const, ...s }) as unknown as TriageStop);
	internals.index = 0;
	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0 };
	return { internals, app, vorgang };
}

function untouched(lineIndex: number, due: string | null = null): IntakeGroupOutcome {
	return { lineIndex, discard: false, due, taken: [], keptOwn: [], keptForeign: [] };
}

beforeEach(() => resetNotices());

describe("SDD triage-note-stops: an itemless group survives an untouched confirm", () => {
	it("leaves an itemless group's line in place when nothing was ticked", async () => {
		const { internals, app, vorgang } = setup();
		const [empty, withItems] = parseIntakeGroups(NOTE);

		await internals.handleIntakeGroupOutcomes([
			untouched(empty.lineIndex),
			{ lineIndex: withItems.lineIndex, discard: false, due: null, taken: [], keptOwn: [...withItems.ownItems], keptForeign: [] },
		]);

		expect(app.vault.files.get(vorgang.path)).toContain("- Aus [[#E-Mail-Thread Acme, 08.09.2026]]");
	});

	it("still defers an itemless group when a date is set on it", async () => {
		const { internals, app, vorgang } = setup();
		const [empty] = parseIntakeGroups(NOTE);

		await internals.handleIntakeGroupOutcomes([untouched(empty.lineIndex, "2099-01-15")]);

		const content = app.vault.files.get(vorgang.path) ?? "";
		expect(content).toContain("- Aus [[#E-Mail-Thread Acme, 08.09.2026]]");
		expect(content).toMatch(/- Aus \[\[#E-Mail-Thread Acme, 08\.09\.2026\]\].*15\.01\.2099/);
	});

	it("still removes a group that HAD items when every line was emptied", async () => {
		const { internals, app, vorgang } = setup();
		const [, withItems] = parseIntakeGroups(NOTE);

		await internals.handleIntakeGroupOutcomes([untouched(withItems.lineIndex)]);

		expect(app.vault.files.get(vorgang.path)).not.toContain("- Aus [[Besprechung - Kickoff]]");
	});
});
