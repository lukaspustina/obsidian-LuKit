import { describe, it, expect, vi, beforeEach } from "vitest";

const { constructed } = vi.hoisted(() => ({ constructed: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/features/task-triage/intake-select-modal", () => ({
	IntakeSelectModal: class {
		constructor(_app: unknown, options: Record<string, unknown>) {
			constructed.push(options);
		}
		open(): void {}
	},
}));

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
	resetNotices,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 4, Test Scenario 8 / Requirement 33a:
// dismissing the item-selection modal without confirming (Esc or
// click-outside, wired to onCancel) returns to the intake stop unchanged — no
// mutation occurs and the group remains exactly as before the modal opened.
//
// `TaskTriageFeature.handleIntakeSelect` and
// `src/features/task-triage/intake-select-modal.ts` do not exist yet, so this
// fails today with "internals.handleIntakeSelect is not a function" — the
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
	presentStop: () => Promise<void>;
	handleIntakeSelect: () => void;
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

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

describe("intake stop — dismissing ⌘S selection without confirming mutates nothing (SDD vorgang-next-steps p4 c8)", () => {
	it("re-presents the same intake stop unchanged when the selection modal is dismissed", async () => {
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
		internals.stops = [intakeStop as unknown as TriageStop];
		internals.index = 0;

		internals.handleIntakeSelect();

		expect(constructed).toHaveLength(1);
		const onCancel = constructed[0].onCancel as () => void;
		onCancel();
		await Promise.resolve();
		await Promise.resolve();

		expect(app.vault.files.get(vorgang.path)).toBe(VORGANG);
		expect(internals.index).toBe(0);
		expect(internals.walkActive).toBe(true);
		expect(internals.presentStop).toHaveBeenCalled();
	});
});
