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

describe("intake ⌘S — a partial take-over returns to the same stop", () => {
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

	it("advances and counts once nothing is left in the group", async () => {
		const { internals } = setup();

		await internals.handleIntakeTakeOver({
			taken: [
				{ text: "Angebot prüfen", children: [] },
				{ text: "Termin vereinbaren", children: [] },
			],
			keptOwn: [],
			keptForeign: [],
		});

		expect(internals.index).toBe(1);
		expect(internals.counts.takenOver).toBe(1);
	});
});
