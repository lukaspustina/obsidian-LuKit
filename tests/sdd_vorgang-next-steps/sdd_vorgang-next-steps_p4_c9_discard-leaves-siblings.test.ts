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
	resetNotices,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 4, Test Scenario 9 / Requirement 34:
// discarding the middle of three intake groups (⌘X) removes only that group —
// the curated part above the boundary is byte-identical AND the first and
// third groups are each byte-for-byte identical to their pre-discard bytes.
//
// `TaskTriageFeature.handleIntakeDiscard` and the "intake" TriageStop kind do
// not exist yet, so this fails today with "internals.handleIntakeDiscard is
// not a function" — the correct RED, not a syntax error.

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
	handleIntakeDiscard: () => Promise<void>;
}

const GROUP_A = ["- Aus [[Besprechung A]]", "    - Punkt A1"];
const GROUP_B = ["- Aus [[Besprechung B]]", "    - Punkt B1", "    - Punkt B2"];
const GROUP_C = ["- Aus [[Besprechung C]]", "    - Punkt C1"];

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
	...GROUP_A,
	...GROUP_B,
	...GROUP_C,
	"",
	"# Inhalt",
	"",
].join("\n");

beforeEach(() => resetNotices());

describe("intake stop — ⌘X discard leaves sibling groups byte-identical (SDD vorgang-next-steps p4 c9)", () => {
	it("removes only the middle group; the curated part and the first/third groups are byte-identical to before", async () => {
		const app = createMockApp({});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });
		app.vault.register(vorgang, VORGANG);

		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new TaskTriageFeature();
		feature.onload(asLuKitPlugin(plugin));
		const internals = feature as unknown as FeatureInternals;

		const groups = parseIntakeGroups(VORGANG);
		expect(groups).toHaveLength(3);
		const middle = groups[1];
		expect(middle.source).toBe("Besprechung B");
		const intakeStop: IntakeTriageStop = { kind: "intake", group: middle, notePath: vorgang.path, noteBasename: vorgang.basename };

		const curatedBefore = VORGANG.slice(0, VORGANG.indexOf("#### Unsortiert"));
		const groupABlock = GROUP_A.join("\n");
		const groupCBlock = GROUP_C.join("\n");

		internals.presentStop = vi.fn(async () => {});
		internals.walkActive = true;
		internals.stops = [intakeStop as unknown as TriageStop];
		internals.index = 0;

		await internals.handleIntakeDiscard();

		const newContent = app.vault.files.get(vorgang.path) ?? "";
		expect(newContent.slice(0, newContent.indexOf("#### Unsortiert"))).toBe(curatedBefore);
		expect(newContent).toContain(groupABlock);
		expect(newContent).toContain(groupCBlock);
		expect(newContent).not.toContain("Aus [[Besprechung B]]");
		expect(parseIntakeGroups(newContent)).toHaveLength(2);
	});
});
