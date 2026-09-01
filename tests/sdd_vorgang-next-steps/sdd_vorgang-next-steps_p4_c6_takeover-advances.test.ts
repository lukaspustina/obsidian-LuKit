import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { TriageStop, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 4, Test Scenario 6 / Requirement 32: pressing
// ⌘D at an intake stop takes over the whole group — every item lands above
// the "#### Unsortiert" boundary and the group disappears — and the walk
// advances to the next stop.
//
// `TaskTriageFeature.handleIntakeTakeOver` and the "intake" TriageStop kind
// do not exist yet, so this fails today with "internals.handleIntakeTakeOver
// is not a function" — the correct RED, not a syntax error.

interface IntakeTriageStop {
	kind: "intake";
	group: IntakeGroup;
	notePath: string;
	noteBasename: string;
}

interface FeatureInternals {
	walkActive: boolean;
	stops: TriageStop[];
	index: number;
	counts: Record<string, number>;
	presentStop: () => Promise<void>;
	handleIntakeTakeOver: (selectedIndices?: number[]) => Promise<void>;
}

function task(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "TaskNotes/Tasks/Kosten pruefen.md",
		title: "Kosten prüfen",
		isCompleted: false,
		due: "2026-07-01",
		priority: "normal",
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

const VORGANG = [
	"---",
	"tags: [Vorgang]",
	"---",
	"",
	"# Fakten und Pointer",
	"",
	"# Nächste Schritte",
	"- Bestehender Punkt",
	"",
	"#### Unsortiert",
	"- Aus [[Besprechung Acme Kickoff]]",
	"    - Angebot einholen",
	"    - Vertrag prüfen",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — ⌘D take-over advances the walk (SDD vorgang-next-steps p4 c6)", () => {
	it("moves both items above the boundary, removes the group, and advances to the next stop", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;

		const group = parseIntakeGroups(VORGANG)[0];
		const intakeStop: IntakeTriageStop = { kind: "intake", group, notePath: vorgang.path, noteBasename: vorgang.basename };

		internals.presentStop = vi.fn(async () => {});
		internals.walkActive = true;
		internals.stops = [intakeStop as unknown as TriageStop, { kind: "task", task: task() }];
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };

		await internals.handleIntakeTakeOver();

		const newContent = app.vault.files.get(vorgang.path) ?? "";
		expect(parseIntakeGroups(newContent)).toHaveLength(0);

		const boundaryIndex = newContent.indexOf("#### Unsortiert");
		const curatedIndex = newContent.indexOf("- Bestehender Punkt");
		const ownIndex1 = newContent.indexOf("- Angebot einholen");
		const ownIndex2 = newContent.indexOf("- Vertrag prüfen");

		expect(boundaryIndex).toBeGreaterThan(0);
		expect(ownIndex1).toBeGreaterThan(curatedIndex);
		expect(ownIndex1).toBeLessThan(boundaryIndex);
		expect(ownIndex2).toBeGreaterThan(curatedIndex);
		expect(ownIndex2).toBeLessThan(boundaryIndex);

		expect(internals.index).toBe(1);
		expect(internals.walkActive).toBe(true);
	});
});
