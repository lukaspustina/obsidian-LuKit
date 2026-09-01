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

// SDD vorgang-next-steps, Phase 4, Test Scenario 11 / Requirement 38: when a
// group's parent line was already removed — by a sibling stop's mutation
// earlier in the same walk, or a hand edit — takeOverGroup/dropGroup/
// snoozeGroup return null (Data Models). The walk must show a German Notice
// and report the failure without crashing, exactly like the
// reminder-line-missing case mutateReminder already handles.
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

// The note as it stands on disk when the walk reaches this stop: the group
// has already been removed — by an earlier stop's own mutation on the same
// note (requirement 39a), or by a hand edit between the read and the write.
const VORGANG_GROUP_ALREADY_REMOVED = [
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
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — a stale group parent line yields null, not a crash (SDD vorgang-next-steps p4 c11)", () => {
	it("shows a Notice and reports the failure when takeOverGroup returns null for a line no longer present", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		// The stop's group was parsed from the pre-removal content — its `line`
		// no longer exists in the note as read fresh at mutation time.
		app.vault.register(vorgang, VORGANG_GROUP_ALREADY_REMOVED);

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

		await expect(internals.handleIntakeTakeOver()).resolves.toBeUndefined();

		expect(lastNotice()).toBeTruthy();
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG_GROUP_ALREADY_REMOVED);
	});
});
