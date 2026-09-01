import { describe, it, expect } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { extractNextStepItemLines } from "../../src/features/besprechung/besprechung-engine";
import { buildIntakeGroup, insertIntakeGroup, parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 3, Test Scenario 3: a Besprechung already
// linked in the target's "# Inhalt" TOC (requirement 11's duplicate-
// protection guard) must add no further intake group when filed again — the
// intake already holds the group from its earlier filing, and re-filing must
// not add a second one.
//
// `extractNextStepItemLines` (besprechung-engine.ts) and the
// `besprechung.nextStepHeadings` setting do not exist yet — imported here by
// name, this is the correct RED state (unresolved symbol). Without it, this
// scenario would be vacuously green today: the existing `alreadyLinked`
// guard already skips writing the Vorgang entirely, which happens to leave
// the pre-seeded single group untouched regardless of any intake logic. The
// `extractNextStepItemLines` assertion additionally pins that the
// Besprechung genuinely has next-step items available, so "no second group"
// is provably the duplicate-protection guard's doing, not an absence of
// items to file.

const BESPRECHUNG_MIT_SCHRITTEN = [
	"---",
	"created: 2026-07-29T09:00:00.000Z",
	"---",
	"",
	"# Nächste Schritte",
	"- Angebot einholen",
	"- Vertrag prüfen",
].join("\n");

describe("BesprechungFeature — kein zweites Intake-Gruppe bei erneuter Ablage (SDD vorgang-next-steps p3 c3)", () => {
	it("adds no second intake group when the Besprechung is already linked in # Inhalt", async () => {
		const besprechung = createMockTFile("Besprechungen/Besprechung Acme Kickoff.md", {
			basename: "Besprechung Acme Kickoff",
		});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });

		// The target already links the Besprechung in # Inhalt (as an earlier
		// filing would have written) and already carries the group that earlier
		// filing would have produced.
		const existingGroup = buildIntakeGroup(["- Angebot einholen", "- Vertrag prüfen"], "Besprechung Acme Kickoff", []);
		const baseVorgang = [
			"---",
			"tags:",
			"  - Vorgang",
			"---",
			"",
			"# Fakten und Pointer",
			"- Bestandsfakt",
			"",
			"# Inhalt",
			"- [[Besprechung Acme Kickoff]]",
			"",
		].join("\n");
		const vorgangContent = insertIntakeGroup(baseVorgang, existingGroup);
		expect(parseIntakeGroups(vorgangContent)).toHaveLength(1); // fixture sanity check

		// The Besprechung genuinely has next-step items to extract — so any
		// absence of a second group must come from the duplicate-protection
		// guard, not from an empty extraction.
		expect(extractNextStepItemLines(BESPRECHUNG_MIT_SCHRITTEN, ["Nächste Schritte"])).toEqual([
			"- Angebot einholen",
			"- Vertrag prüfen",
		]);

		const app = createMockApp({});
		app.vault.register(besprechung, BESPRECHUNG_MIT_SCHRITTEN);
		app.vault.register(vorgang, vorgangContent);
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

		await (
			feature as unknown as {
				fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void>;
			}
		).fileBesprechungIntoVorgang(besprechung, vorgang);

		const result = app.vault.files.get(vorgang.path) ?? "";
		const groups = parseIntakeGroups(result);
		expect(groups).toHaveLength(1);
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Angebot einholen", "Vertrag prüfen"]);
	});
});
