import { describe, it, expect, vi, beforeEach } from "vitest";

// SDD vorgang-next-steps, Phase 3, Test Scenario 2: filing the same
// Besprechung through the single-shot command ("Besprechung: Aktuelle Notiz
// ablegen") must produce a result identical to filing it through the pending
// walk (Scenario 1) — both commands funnel into the same intake write.
//
// `extractNextStepItemLines` (besprechung-engine.ts) and the
// `besprechung.nextStepHeadings` setting do not exist yet, so neither path
// writes a group today; this is the correct RED state.

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

function settingsMitNextSteps() {
	return makeTestSettings({
		besprechung: {
			...makeTestSettings().besprechung,
			sectionHeadings: ["Zusammenfassung"],
			decisionHeadings: [],
			nextStepHeadings: ["Nächste Schritte"],
		},
	});
}

async function fileThroughPendingWalk(): Promise<string> {
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

	const plugin = createMockPlugin(settingsMitNextSteps(), app);
	const feature = new BesprechungFeature();
	feature.onload(asLuKitPlugin(plugin));

	plugin.commands.get("besprechung-file-pending")?.callback?.();
	await Promise.resolve();
	await Promise.resolve();

	const onPick = constructed[0].onPick as (file: typeof vorgang) => void;
	onPick(vorgang);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();

	return app.vault.files.get(vorgang.path) ?? "";
}

async function fileThroughSingleShot(): Promise<string> {
	const besprechung = createMockTFile("Besprechungen/Besprechung Acme Kickoff.md", {
		basename: "Besprechung Acme Kickoff",
	});
	const vorgang = createMockTFile("Vorgänge/Vorgang - Acme.md", { basename: "Vorgang - Acme" });

	const app = createMockApp({});
	app.vault.register(besprechung, BESPRECHUNG_MIT_SCHRITTEN);
	app.vault.register(vorgang, VORGANG);
	app.metadataCache.setFrontmatter(besprechung.path, { tags: ["Besprechung"] });
	app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });
	app.workspace.activeFile = besprechung;

	const plugin = createMockPlugin(settingsMitNextSteps(), app);
	const feature = new BesprechungFeature();
	feature.onload(asLuKitPlugin(plugin));

	plugin.commands.get("besprechung-file-this")?.callback?.();
	// fileActiveBesprechungCmd opens the picker synchronously (no preview
	// fetch), so the modal is already constructed here.

	const onPick = constructed[0].onPick as (file: typeof vorgang) => void;
	onPick(vorgang);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();

	return app.vault.files.get(vorgang.path) ?? "";
}

describe("BesprechungFeature — Nächste-Schritte-Intake über den Single-Shot-Befehl (SDD vorgang-next-steps p3 c2)", () => {
	it("produces a result identical to filing the same Besprechung through the pending walk", async () => {
		constructed.length = 0;
		const walkResult = await fileThroughPendingWalk();
		constructed.length = 0;
		const singleShotResult = await fileThroughSingleShot();

		expect(singleShotResult).toBe(walkResult);

		const groups = parseIntakeGroups(singleShotResult);
		expect(groups).toHaveLength(1);
		expect(groups[0].source).toBe("Besprechung Acme Kickoff");
		expect(groups[0].ownItems.map((i) => i.text)).toEqual([
			"Angebot einholen",
			"Vertrag prüfen",
			"Rückmeldung abwarten",
		]);
	});
});
