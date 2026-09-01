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

// SDD vorgang-next-steps, Phase 4, Test Scenario 7 / Requirement 33: ⌘S opens
// the item-selection modal (IntakeSelectModal, one checkbox per item, all
// preselected). Unticking one of three items and confirming moves only the
// two ticked items above the boundary and removes the whole group regardless.
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
	"    - Rückmeldung abwarten",
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

describe("intake stop — ⌘S item selection moves only the ticked items (SDD vorgang-next-steps p4 c7)", () => {
	it("moves two of three items above the boundary and removes the whole group when the middle item is unticked", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;

		const group = parseIntakeGroups(VORGANG)[0];
		expect(group.ownItems).toHaveLength(3);
		const intakeStop: IntakeTriageStop = { kind: "intake", group, notePath: vorgang.path, noteBasename: vorgang.basename };

		internals.presentStop = vi.fn(async () => {});
		internals.walkActive = true;
		internals.stops = [intakeStop as unknown as TriageStop];
		internals.index = 0;

		internals.handleIntakeSelect();

		expect(constructed).toHaveLength(1);
		const onConfirm = constructed[0].onConfirm as (selectedIndices: number[]) => void;
		// "Vertrag prüfen" (index 1) is unticked — only indices 0 and 2 confirm.
		onConfirm([0, 2]);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const newContent = app.vault.files.get(vorgang.path) ?? "";
		expect(parseIntakeGroups(newContent)).toHaveLength(0);
		expect(newContent).not.toContain("Aus [[Besprechung Acme Kickoff]]");

		const boundaryIndex = newContent.indexOf("#### Unsortiert");
		const idxAngebot = newContent.indexOf("- Angebot einholen");
		const idxVertrag = newContent.indexOf("- Vertrag prüfen");
		const idxRueckmeldung = newContent.indexOf("- Rückmeldung abwarten");

		expect(idxAngebot).toBeGreaterThan(0);
		expect(idxAngebot).toBeLessThan(boundaryIndex);
		expect(idxRueckmeldung).toBeGreaterThan(0);
		expect(idxRueckmeldung).toBeLessThan(boundaryIndex);
		expect(idxVertrag).toBe(-1);
	});
});
