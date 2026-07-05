import { describe, it, expect, beforeEach } from "vitest";
import { VorgangFeature } from "../../src/features/vorgang/vorgang-feature";
import {
	createMockApp,
	createMockTFile,
	createMockPlugin,
	makeTestSettings,
	asLuKitPlugin,
	resetNotices,
} from "../helpers/obsidian-mocks";
import type { MockTFile } from "../helpers/obsidian-mocks";

beforeEach(() => {
	resetNotices();
});

describe("SDD vorgang-merge p2 c2 — no-rename guard on mergeInto", () => {
	it("never calls fileManager.renameFile on a successful merge (regression guard vs. vorgang-close)", async () => {
		const app = createMockApp({});
		const plugin = createMockPlugin(makeTestSettings(), app);
		const feature = new VorgangFeature();
		feature.onload(asLuKitPlugin(plugin));

		const source = createMockTFile("Vorgänge/Vorgang - Quelle.md");
		const sourceContent = "---\ntags:\n  - Vorgang\n---\n\n# Fakten und Pointer\n- A\n\n# Inhalt\n";
		app.vault.register(source, sourceContent);
		app.metadataCache.setFrontmatter(source.path, { tags: ["Vorgang"] });
		app.fileManager.frontmatter.set(source.path, { tags: ["Vorgang"] });

		const target = createMockTFile("Vorgänge/Vorgang - Ziel.md");
		const targetContent = "---\ntags:\n  - Vorgang\n---\n\n# Fakten und Pointer\n- X\n\n# Inhalt\n";
		app.vault.register(target, targetContent);
		app.metadataCache.setFrontmatter(target.path, { tags: ["Vorgang"] });
		app.fileManager.frontmatter.set(target.path, { tags: ["Vorgang"] });

		await (feature as unknown as {
			mergeInto: (source: MockTFile, target: MockTFile) => Promise<void>;
		}).mergeInto(source, target);

		// Merge actually happened: source became a stub referencing the target.
		expect(app.vault.files.get(source.path)).toContain(`Zusammengeführt in [[${target.basename}]].`);

		// R8: the source is never renamed on merge (unlike vorgang-close).
		expect(app.fileManager.renamedTo).toEqual([]);
	});
});
