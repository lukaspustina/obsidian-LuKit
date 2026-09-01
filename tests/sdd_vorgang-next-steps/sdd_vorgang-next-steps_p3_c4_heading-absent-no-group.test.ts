import { describe, it, expect } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import { extractNextStepItemLines } from "../../src/features/besprechung/besprechung-engine";
import { parseIntakeGroups } from "../../src/features/vorgang/intake-engine";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";

// SDD vorgang-next-steps, Phase 3, Test Scenario 4: a Besprechung whose
// configured next-step heading is absent must write no intake group when
// filed, and the h5 archive section must be unaffected — the missing
// "# Nächste Schritte" section must not break the existing filing of
// "# Zusammenfassung".
//
// `extractNextStepItemLines` (besprechung-engine.ts) and the
// `besprechung.nextStepHeadings` setting do not exist yet — imported here by
// name, this is the correct RED state (unresolved symbol). Without it, this
// scenario would be vacuously green today: BesprechungFeature never touches
// "# Nächste Schritte" at all yet, so "no group" and "h5 unaffected" already
// hold with zero implementation. The `extractNextStepItemLines` assertion
// pins the actual requirement — that extraction over an absent heading
// yields no items — instead of relying on an accidental absence of
// behaviour.

const BESPRECHUNG_OHNE_SCHRITTE = [
	"---",
	"created: 2026-07-29T09:00:00.000Z",
	"---",
	"",
	"# Zusammenfassung",
	"- Wir haben alles besprochen",
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

describe("BesprechungFeature — kein Intake-Gruppe ohne konfigurierte Nächste-Schritte-Überschrift (SDD vorgang-next-steps p3 c4)", () => {
	it("writes no intake group and leaves the h5 section unaffected when the configured heading is absent", async () => {
		const besprechung = createMockTFile("Besprechungen/Besprechung Acme Kickoff.md", {
			basename: "Besprechung Acme Kickoff",
		});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });

		const app = createMockApp({});
		app.vault.register(besprechung, BESPRECHUNG_OHNE_SCHRITTE);
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

		await (
			feature as unknown as {
				fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void>;
			}
		).fileBesprechungIntoVorgang(besprechung, vorgang);

		// The heading is genuinely absent: extraction yields no items.
		expect(extractNextStepItemLines(BESPRECHUNG_OHNE_SCHRITTE, ["Nächste Schritte"])).toEqual([]);

		const result = app.vault.files.get(vorgang.path) ?? "";

		// No intake group and no intake structure created.
		expect(parseIntakeGroups(result)).toHaveLength(0);
		expect(result).not.toContain("Nächste Schritte");
		expect(result).not.toContain("#### Unsortiert");

		// The h5 archive section, built from the unrelated "Zusammenfassung"
		// heading, is unaffected by the absent next-step heading.
		expect(result).toContain("##### [[Besprechung Acme Kickoff]]");
		expect(result).toContain("**Zusammenfassung**");
		expect(result).toContain("- Wir haben alles besprochen");
	});
});
