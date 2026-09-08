// Found by the independent review pass (2026-09-08) and verified against the
// engine before it was reported: with two intake groups whose parent lines AND
// item lists are byte-identical — reachable through vorgang-merge, which
// splices a source's groups into the target without dedup — a partial
// take-over plus a date on the FIRST group wrote the date onto the SECOND.
// takeOverGroup resolved group 1 by its fresh lineIndex and shifted the note;
// the snooze then fell back to content matching with the PRE-take-over
// snapshot, which no longer matched group 1's rewritten block but did match
// group 2's. The sibling's own take-over then rewrote group 1 and restored the
// item that had just been moved out — silently, with no Notice.

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
	noticeMessages,
	resetNotices,
} from "../helpers/obsidian-mocks";

const NOTE_PATH = "Vorgänge/Vorgang Acme Kickoff.md";
const NOTE_BASENAME = "Vorgang Acme Kickoff";

// Byte-identical twins: same parent line, same items.
const TWINS = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Nächste Schritte",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung Kickoff]]",
	"    - Angebot einholen",
	"    - Termin bestätigen",
	"",
	"- Aus [[Besprechung Kickoff]]",
	"    - Angebot einholen",
	"    - Termin bestätigen",
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
	app.vault.register(vorgang, TWINS);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	const candidates: IntakeStopCandidate[] = parseIntakeGroups(TWINS).map((group) => ({
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

beforeEach(() => resetNotices());

describe("SDD triage-note-stops: a group's date lands on that group, not on its twin", () => {
	it("dates the group it was set on when a partial take-over rewrote it first", async () => {
		const { internals, app, vorgang } = setup();
		const [first] = parseIntakeGroups(TWINS);

		await internals.handleIntakeGroupOutcomes([
			{
				lineIndex: first.lineIndex,
				discard: false,
				due: "2026-09-20",
				taken: [first.ownItems[0]],
				keptOwn: [first.ownItems[1]],
				keptForeign: [],
			},
		]);

		const content = app.vault.files.get(vorgang.path) ?? "";
		const lines = content.split("\n");
		const boundary = lines.findIndex((l) => l.trim() === "#### Unsortiert");
		const groupLines = lines.slice(boundary).filter((l) => l.startsWith("- Aus "));

		// Exactly one group carries the date, and it is the one that was worked:
		// the dated group holds only the kept item, the twin is untouched.
		expect(groupLines.filter((l) => l.includes("20.09.2026"))).toHaveLength(1);
		const groups = parseIntakeGroups(content);
		const dated = groups.find((g) => g.line.includes("20.09.2026"));
		expect(dated?.ownItems.map((i) => i.text)).toEqual(["Termin bestätigen"]);
		const twin = groups.find((g) => !g.line.includes("20.09.2026"));
		expect(twin?.ownItems.map((i) => i.text)).toEqual(["Angebot einholen", "Termin bestätigen"]);

		// The moved item did not come back.
		expect(lines.slice(0, boundary).filter((l) => l === "- Angebot einholen")).toHaveLength(1);
		expect(noticeMessages()).toEqual([]);
	});
});
