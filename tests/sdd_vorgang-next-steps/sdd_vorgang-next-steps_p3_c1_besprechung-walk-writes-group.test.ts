import { describe, it, expect, vi, beforeEach } from "vitest";

// SDD vorgang-next-steps, Phase 3, Test Scenario 1: a Besprechung whose
// "# Nächste Schritte" section holds three bullets, filed through the
// pending walk ("Besprechungen: Alle offenen ablegen"), must produce exactly
// one intake group in the target Vorgang, holding all three items and
// linking the Besprechung by note name.
//
// `extractNextStepItemLines` (besprechung-engine.ts) and the
// `besprechung.nextStepHeadings` setting do not exist yet, so
// BesprechungFeature never builds or writes an intake group today — this is
// the correct RED state, surfaced as an assertion failure against
// `parseIntakeGroups`, not a crash.

const { constructed } = vi.hoisted(() => ({ constructed: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/shared/modals/section-note-suggest", () => ({
	SectionNoteSuggestModal: class {
		constructor(_app: unknown, _tags: unknown, options: Record<string, unknown>) {
			constructed.push(options);
		}
		open(): void {}
	},
}));

import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
	constructed.length = 0;
});

const BESPRECHUNG_MIT_SCHRITTEN = [
	"---",
	"created: 2026-07-29T09:00:00.000Z",
	"---",
	"",
	"# Nächste Schritte",
	"- Angebot einholen",
	"- Vertrag prüfen",
	"- Rückmeldung abwarten",
].join("\n");

const VORGANG = [
	"---",
	"tags:",
	"  - Vorgang",
	"---",
	"",
	"# Fakten und Pointer",
	"- Bestandsfakt",
	"",
	"# Inhalt",
	"",
].join("\n");

describe("BesprechungFeature — Nächste-Schritte-Intake über den Ablage-Walk (SDD vorgang-next-steps p3 c1)", () => {
	it("writes one intake group with all three items, linking the Besprechung", async () => {
		const besprechung = createMockTFile("Besprechungen/Besprechung Acme Kickoff.md", {
			basename: "Besprechung Acme Kickoff",
		});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });

		const app = createMockApp({});
		app.vault.register(besprechung, BESPRECHUNG_MIT_SCHRITTEN);
		app.vault.register(vorgang, VORGANG);
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });
		app.fileManager.frontmatter.set(besprechung.path, { tags: ["Besprechung", "todo"] });

		const settings = makeTestSettings({
			besprechung: {
				...makeTestSettings().besprechung,
				sectionHeadings: ["Zusammenfassung"],
				decisionHeadings: [],
				nextStepHeadings: ["Nächste Schritte"],
			},
		});
		const plugin = createMockPlugin(settings, app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		plugin.commands.get("besprechung-file-pending")?.callback?.();
		// The walk reads the besprechung to build the preview panel text before
		// opening the picker — flush that async read.
		await Promise.resolve();
		await Promise.resolve();

		expect(constructed).toHaveLength(1);
		const onPick = constructed[0].onPick as (file: typeof vorgang) => void;
		onPick(vorgang);
		// fileBesprechungIntoVorgang runs fire-and-forget from onPick; flush its
		// read/modify chain.
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const result = app.vault.files.get(vorgang.path) ?? "";
		const groups = parseIntakeGroups(result);
		expect(groups).toHaveLength(1);
		expect(groups[0].source).toBe("Besprechung Acme Kickoff");
		expect(groups[0].ownItems.map((i) => i.text)).toEqual([
			"Angebot einholen",
			"Vertrag prüfen",
			"Rückmeldung abwarten",
		]);
		expect(groups[0].foreignItems).toEqual([]);
	});
});
