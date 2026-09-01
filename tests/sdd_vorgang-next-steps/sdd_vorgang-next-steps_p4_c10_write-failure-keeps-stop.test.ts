import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskTriageFeature } from "../../src/features/task-triage/task-triage-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import type { IntakeGroup } from "../../src/features/vorgang/intake-engine";
import type { TriageStop } from "../../src/features/task-triage/task-triage-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 4, Test Scenario 10 / Requirement 38: a
// failing vault write on ⌘D shows a Notice, keeps the walk on the same
// intake stop, and leaves the note byte-identical to before the attempt —
// mirroring the existing reminder/task mutation-failure contract
// (mutateReminder's shape in task-triage-feature.ts).
//
// `TaskTriageFeature.handleIntakeTakeOver` does not exist yet, so this fails
// today with "internals.handleIntakeTakeOver is not a function" — the
// correct RED, not a syntax error.

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
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — a failing write on ⌘D keeps the stop and shows a Notice (SDD vorgang-next-steps p4 c10)", () => {
	it("does not advance and leaves the note byte-identical when app.vault.process rejects", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);
		app.vault.process = vi.fn(async () => {
			throw new Error("disk full");
		});

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;

		const group = parseIntakeGroups(VORGANG)[0];
		const intakeStop: IntakeTriageStop = { kind: "intake", group, notePath: vorgang.path, noteBasename: vorgang.basename };

		internals.presentStop = vi.fn(async () => {});
		internals.walkActive = true;
		internals.stops = [intakeStop as unknown as TriageStop];
		internals.index = 0;
		internals.counts = { completed: 0, snoozed: 0, instancesSkipped: 0, skipped: 0 };

		await internals.handleIntakeTakeOver();

		expect(lastNotice()).toBeTruthy();
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG);
	});
});
