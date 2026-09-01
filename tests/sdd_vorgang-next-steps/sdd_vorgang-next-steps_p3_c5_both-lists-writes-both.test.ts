import { describe, it, expect } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 3, Test Scenario 5 (requirement 17): a
// heading listed in both `sectionHeadings` and `nextStepHeadings` must land
// in both the h5 archive body and the intake — the two settings are
// independent, and listing a heading in both is not a conflict.
//
// `extractNextStepItemLines` (besprechung-engine.ts) and the
// `besprechung.nextStepHeadings` setting do not exist yet, so no group is
// ever written today — the correct RED state, surfaced via
// `parseIntakeGroups` returning no groups.

const BESPRECHUNG_MIT_SCHRITTEN = [
	"---",
	"created: 2026-07-29T09:00:00.000Z",
	"---",
	"",
	"# Nächste Schritte",
	"- Angebot einholen",
	"- Vertrag prüfen",
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

describe("BesprechungFeature — Überschrift in beiden Listen füllt h5-Body und Intake (SDD vorgang-next-steps p3 c5)", () => {
	it("writes the heading's content to both the h5 section body and the intake", async () => {
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

		// "Nächste Schritte" appears in both lists — the deliberately overlapping
		// case requirement 17 pins.
		const settings = makeTestSettings({
			besprechung: {
				...makeTestSettings().besprechung,
				sectionHeadings: ["Nächste Schritte"],
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

		// h5 body: the archived section still carries the content.
		expect(result).toContain("##### [[Besprechung Acme Kickoff]]");
		expect(result).toContain("**Nächste Schritte**");
		expect(result).toContain("- Angebot einholen");
		expect(result).toContain("- Vertrag prüfen");

		// Intake: the same content is also filed as a group.
		const groups = parseIntakeGroups(result);
		expect(groups).toHaveLength(1);
		expect(groups[0].source).toBe("Besprechung Acme Kickoff");
		expect(groups[0].ownItems.map((i) => i.text)).toEqual(["Angebot einholen", "Vertrag prüfen"]);
	});
});
