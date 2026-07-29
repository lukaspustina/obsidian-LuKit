import { describe, it, expect, vi } from "vitest";
import { BesprechungFeature } from "../../src/features/besprechung/besprechung-feature";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
} from "../helpers/obsidian-mocks";
import { formatBesprechungSummary } from "../../src/features/besprechung/besprechung-engine";

// Simulates content returned by vault.read() for a meeting note
const MEETING_NOTE = [
	"---",
	"created: 2026-01-22T13:30:09.864Z",
	"---",
	"",
	"### Agenda",
	"- Item 1",
	"- Item 2",
	"",
	"### Nächste Schritte",
	"- Do the thing",
	"- Review the code",
	"",
	"### Zusammenfassung",
	"- We decided X",
	"- Everyone agreed Y",
].join("\n");

describe("Besprechung: Zusammenfassung einfügen command flow", () => {
	it("extracts and formats both default sections", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result.missing).toEqual([]);
		expect(result.body).toContain("**Nächste Schritte**");
		expect(result.body).toContain("**Zusammenfassung**");
		expect(result.body).toContain("- Do the thing");
		expect(result.body).toContain("- We decided X");
	});

	it("does not include sections not in the configured list", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result.body).not.toContain("Agenda");
		expect(result.body).not.toContain("Item 1");
	});

	it("returns empty body and full missing list when vault content has no matching sections", () => {
		const content = "### Meine Notizen\n- Just notes";
		const result = formatBesprechungSummary(content);
		expect(result.body).toBe("");
		expect(result.missing).toEqual(["Nächste Schritte", "Zusammenfassung"]);
	});

	it("uses custom section headings from settings", () => {
		const result = formatBesprechungSummary(MEETING_NOTE, ["Agenda"]);
		expect(result.body).toBe("**Agenda**\n- Item 1\n- Item 2");
		expect(result.missing).toEqual([]);
	});

	it("extracts sections in configured order regardless of note order", () => {
		const content = "### Beta\n- B content\n### Alpha\n- A content";
		const result = formatBesprechungSummary(content, ["Alpha", "Beta"]);
		expect(result.body).toBe("**Alpha**\n- A content\n\n**Beta**\n- B content");
	});

	it("returns empty body and empty missing when configured section headings list is empty", () => {
		const result = formatBesprechungSummary(MEETING_NOTE, []);
		expect(result.body).toBe("");
		expect(result.missing).toEqual([]);
	});

	it("formats result as insert-ready text with no leading/trailing blank lines", () => {
		const result = formatBesprechungSummary(MEETING_NOTE);
		expect(result.body.startsWith("\n")).toBe(false);
		expect(result.body.endsWith("\n")).toBe(false);
	});
});

// SDD besprechung-entscheidungen, Phase 3 — Verdrahtung des Fakten-Logs in den
// vault.modify-Ablagepfad (Walk und Single-Shot).
describe("BesprechungFeature.fileBesprechungIntoVorgang — Entscheidungs-Log", () => {
	const BESPRECHUNG_MIT_ENTSCHEIDUNGEN = [
		"---",
		"created: 2026-07-29T09:00:00.000Z",
		"---",
		"",
		"# Entscheidungen",
		"- Migration auf Variante B",
		"- Budget bleibt bei Q3",
		"",
		"# Nächste Schritte",
		"- Angebot prüfen",
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

	const settingsMitEntscheidungen = () =>
		makeTestSettings({
			besprechung: {
				...makeTestSettings().besprechung,
				sectionHeadings: ["Entscheidungen", "Nächste Schritte"],
				decisionHeadings: ["Entscheidungen"],
			},
		});

	const fileInto = async (
		besprechungContent: string,
		vorgangContent: string,
		settings = settingsMitEntscheidungen(),
	): Promise<{ vorgang: string; modifyCalls: number }> => {
		const besprechung = createMockTFile("Besprechungen/Acme Kickoff.md");
		const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md");

		const app = createMockApp({});
		app.vault.register(besprechung, besprechungContent);
		app.vault.register(vorgang, vorgangContent);
		app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung", "todo"] });
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });

		let modifyCalls = 0;
		const realModify = app.vault.modify;
		app.vault.modify = vi.fn(async (file, content) => {
			if (file.path === vorgang.path) modifyCalls++;
			return realModify(file, content);
		});

		const plugin = createMockPlugin(settings, app);
		const feature = new BesprechungFeature();
		feature.onload(asLuKitPlugin(plugin));

		await (
			feature as unknown as {
				fileBesprechungIntoVorgang: (b: typeof besprechung, v: typeof vorgang) => Promise<void>;
			}
		).fileBesprechungIntoVorgang(besprechung, vorgang);

		return { vorgang: app.vault.files.get(vorgang.path) ?? "", modifyCalls };
	};

	it("writes the h5 section and the Fakten block in a single modify call", async () => {
		const { vorgang, modifyCalls } = await fileInto(BESPRECHUNG_MIT_ENTSCHEIDUNGEN, VORGANG);

		expect(vorgang).toContain("##### [[Acme Kickoff]]");
		expect(vorgang).toContain("**Entscheidungen**");
		expect(vorgang).toContain("- Entscheidungen ");
		expect(vorgang).toContain("([[Acme Kickoff]])");
		expect(vorgang).toContain("    - Migration auf Variante B");
		expect(vorgang).toContain("    - Budget bleibt bei Q3");
		expect(modifyCalls).toBe(1);
	});

	it("keeps the manual fact above the decisions block", async () => {
		const { vorgang } = await fileInto(BESPRECHUNG_MIT_ENTSCHEIDUNGEN, VORGANG);
		expect(vorgang.indexOf("- Bestandsfakt")).toBeLessThan(vorgang.indexOf("- Entscheidungen "));
	});

	it("leaves the Fakten section untouched for a besprechung without decisions", async () => {
		const ohne = "---\n---\n\n# Nächste Schritte\n- Angebot prüfen\n";
		const { vorgang } = await fileInto(ohne, VORGANG);
		expect(vorgang).not.toContain("- Entscheidungen ");
		expect(vorgang).toContain("- Bestandsfakt");
		expect(vorgang).toContain("##### [[Acme Kickoff]]");
	});

	it("does not log decisions when the Vorgang has no Fakten section", async () => {
		const ohneFakten = "---\ntags:\n  - Vorgang\n---\n\n# Inhalt\n";
		const { vorgang } = await fileInto(BESPRECHUNG_MIT_ENTSCHEIDUNGEN, ohneFakten);
		expect(vorgang).not.toContain("- Entscheidungen ");
		expect(vorgang).toContain("**Entscheidungen**");
	});

	it("does not log decisions when decisionHeadings is empty", async () => {
		const settings = makeTestSettings({
			besprechung: {
				...makeTestSettings().besprechung,
				sectionHeadings: ["Entscheidungen"],
				decisionHeadings: [],
			},
		});
		const { vorgang } = await fileInto(BESPRECHUNG_MIT_ENTSCHEIDUNGEN, VORGANG, settings);
		expect(vorgang).not.toContain("- Entscheidungen ");
		expect(vorgang).toContain("**Entscheidungen**");
	});
});
