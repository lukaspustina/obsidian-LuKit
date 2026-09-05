import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeTakeOver } from "../../src/features/vorgang/intake-engine";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

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
	handleIntakeTakeOver: (selection?: IntakeTakeOver) => Promise<void>;
	handleSkip: () => Promise<void>;
	availableActions: (stop: TriageStop) => { snooze: boolean; skipInstance: boolean };
}

function setup() {
	const app = createMockApp({});
	const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
	app.vault.register(vorgang, VORGANG);

	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new TaskTriageFeature();
	feature.onload(asLuKitPlugin(plugin));
	const internals = feature as unknown as FeatureInternals;

	internals.presentStop = vi.fn(async () => {});
	internals.walkActive = true;
	internals.stops = [
		{
			kind: "intake",
			group: parseIntakeGroups(VORGANG)[0],
			notePath: vorgang.path,
			noteBasename: vorgang.basename,
		} as unknown as TriageStop,
		{ kind: "intake", group: parseIntakeGroups(VORGANG)[0], notePath: "other.md", noteBasename: "other" } as unknown as TriageStop,
	];
	internals.index = 0;
	internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0, takenOver: 0, discarded: 0 };
	return { internals, app, vorgang };
}

beforeEach(() => resetNotices());

describe("intake ⌘S — sorting the intake is a sub-task, not the end of the stop", () => {
	it("keeps the unticked line, stays on the stop, and refreshes its group", async () => {
		const { internals, app, vorgang } = setup();

		await internals.handleIntakeTakeOver({
			taken: [{ text: "Angebot prüfen", children: [] }],
			keptOwn: [{ text: "Termin vereinbaren", children: [] }],
			keptForeign: [],
		});

		expect(internals.index).toBe(0);
		expect(internals.presentStop).toHaveBeenCalled();

		const groups = parseIntakeGroups(app.vault.files.get(vorgang.path) ?? "");
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Termin vereinbaren"]);
		// The stop now carries the group as it stands, so the next action works
		// on current line numbers rather than the ones read before the write.
		const stop = internals.stops[0] as Extract<TriageStop, { kind: "intake" }>;
		expect(stop.group.ownItems.map((i) => i.text)).toEqual(["Termin vereinbaren"]);
		expect(stop.group.lineIndex).toBe(groups[0].lineIndex);
	});

	it("counts nothing while the stop is still open — the action that finishes it does", async () => {
		const { internals } = setup();

		await internals.handleIntakeTakeOver({
			taken: [{ text: "Angebot prüfen", children: [] }],
			keptOwn: [{ text: "Termin vereinbaren", children: [] }],
			keptForeign: [],
		});

		expect(internals.counts.takenOver).toBe(0);
	});

	it("stays on the stop even when the group is emptied, and withdraws its actions", async () => {
		const { internals } = setup();

		await internals.handleIntakeTakeOver({
			taken: [
				{ text: "Angebot prüfen", children: [] },
				{ text: "Termin vereinbaren", children: [] },
			],
			keptOwn: [],
			keptForeign: [],
		});

		// The note's own dates are still to be set here — that is the reason for
		// coming back at all.
		expect(internals.index).toBe(0);
		const stop = internals.stops[0] as Extract<TriageStop, { kind: "intake" }>;
		expect(stop.groupDone).toBe(true);
		// Snoozing addresses the group's parent line, which is gone.
		expect(internals.availableActions(stop).snooze).toBe(false);
	});

	it("reports the take-over, not a skip, when the stop is finally left", async () => {
		const { internals } = setup();

		await internals.handleIntakeTakeOver({
			taken: [{ text: "Angebot prüfen", children: [] }],
			keptOwn: [{ text: "Termin vereinbaren", children: [] }],
			keptForeign: [],
		});
		await internals.handleSkip();

		expect(internals.counts.takenOver).toBe(1);
		expect(internals.counts.skipped).toBe(0);
		expect(internals.index).toBe(1);
	});

	it("counts a plain skip as a skip", async () => {
		const { internals } = setup();

		await internals.handleSkip();

		expect(internals.counts.skipped).toBe(1);
		expect(internals.counts.takenOver).toBe(0);
	});

	it("⌘D still means done with the group and advances", async () => {
		const { internals } = setup();

		await internals.handleIntakeTakeOver();

		expect(internals.index).toBe(1);
		expect(internals.counts.takenOver).toBe(1);
	});
});
