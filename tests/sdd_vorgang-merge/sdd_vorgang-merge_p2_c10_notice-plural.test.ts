import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	lastNotice,
	resetNotices,
} from "../helpers/obsidian-mocks";
import type { MockTFile } from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

const SOURCE_CONTENT =
	"---\ntags: [Vorgang]\n---\n" +
	"# Fakten und Pointer\n" +
	"- Quellfakt\n" +
	"\n" +
	"# Inhalt\n" +
	"\n" +
	"##### [[Besprechung - Acme]], 01.07.2026\n" +
	"- Acme-Inhalt\n" +
	"\n" +
	"##### [[Besprechung - Beta]], 02.07.2026\n" +
	"- Beta-Inhalt\n" +
	"\n" +
	"##### [[Besprechung - Gamma]], 03.07.2026\n" +
	"- Gamma-Inhalt\n";

// One target section already linked (Acme) → 2 merged, 1 duplicate.
const TARGET_CONTENT_ONE_DUPLICATE =
	"---\ntags: [Vorgang]\n---\n" +
	"# Fakten und Pointer\n" +
	"- Zielfakt\n" +
	"\n" +
	"# Inhalt\n" +
	"- [[#Besprechung - Acme, 30.06.2026]]\n" +
	"\n" +
	"##### [[Besprechung - Acme]], 30.06.2026\n" +
	"- Alter Inhalt\n";

// Two target sections already linked (Acme, Beta) → 1 merged, 2 duplicates.
const TARGET_CONTENT_TWO_DUPLICATES =
	"---\ntags: [Vorgang]\n---\n" +
	"# Fakten und Pointer\n" +
	"- Zielfakt\n" +
	"\n" +
	"# Inhalt\n" +
	"- [[#Besprechung - Acme, 30.06.2026]]\n" +
	"- [[#Besprechung - Beta, 29.06.2026]]\n" +
	"\n" +
	"##### [[Besprechung - Acme]], 30.06.2026\n" +
	"- Alter Inhalt\n" +
	"\n" +
	"##### [[Besprechung - Beta]], 29.06.2026\n" +
	"- Alter Inhalt\n";

function setup(targetContent: string) {
	const app = createMockApp({});
	const plugin = createMockPlugin(makeTestSettings(), app);
	const feature = new VorgangFeature();
	feature.onload(asLuKitPlugin(plugin));

	const source: MockTFile = createMockTFile("Vorgänge/Vorgang - Quelle.md");
	const target: MockTFile = createMockTFile("Vorgänge/Vorgang - Ziel.md");
	app.vault.register(source, SOURCE_CONTENT);
	app.vault.register(target, targetContent);

	const sourceFm = { tags: ["Vorgang"] };
	app.metadataCache.setFrontmatter(source.path, sourceFm);
	app.fileManager.frontmatter.set(source.path, { ...sourceFm });

	const targetFm = { tags: ["Vorgang"] };
	app.metadataCache.setFrontmatter(target.path, targetFm);
	app.fileManager.frontmatter.set(target.path, { ...targetFm });

	return { app, feature, source, target };
}

describe("SDD vorgang-merge p2 c10 — notice plural formatting", () => {
	it("uses plural forms for mergedSections = 2 and skippedDuplicates = 1", async () => {
		const { feature, source, target } = setup(TARGET_CONTENT_ONE_DUPLICATE);

		await (feature as unknown as {
			mergeInto: (s: MockTFile, t: MockTFile) => Promise<void>;
		}).mergeInto(source, target);

		expect(lastNotice()).toBe(
			"„Vorgang - Quelle“ → „Vorgang - Ziel“: 2 Sektionen übernommen, 1 Duplikat übersprungen.",
		);
	});

	it("uses singular 'Sektion' and plural 'Duplikate' for mergedSections = 1 and skippedDuplicates = 2", async () => {
		const { feature, source, target } = setup(TARGET_CONTENT_TWO_DUPLICATES);

		await (feature as unknown as {
			mergeInto: (s: MockTFile, t: MockTFile) => Promise<void>;
		}).mergeInto(source, target);

		expect(lastNotice()).toBe(
			"„Vorgang - Quelle“ → „Vorgang - Ziel“: 1 Sektion übernommen, 2 Duplikate übersprungen.",
		);
	});
});
