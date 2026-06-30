import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the options passed to every SectionNoteSuggestModal construction.
// `vi.spyOn` cannot intercept a constructor that the feature imports by value,
// so the class is replaced via vi.mock with a recording stub.
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
import type { FiledRecord } from "../../src/features/besprechung/besprechung-suggest-engine";
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

type FeaturePrivates = {
	buildFilingCorpus: (exclude: { path: string }) => FiledRecord[];
};

function makeFeature(app: ReturnType<typeof createMockApp>, settings = makeTestSettings()) {
	const plugin = createMockPlugin(settings, app);
	const feature = new BesprechungFeature();
	feature.onload(asLuKitPlugin(plugin));
	return { feature, plugin };
}

describe("BesprechungFeature filing suggestions — modal wiring", () => {
	it("passes the learned target as the top suggestion to the modal (File this Besprechung)", () => {
		const app = createMockApp({});
		// Two corpus besprechungen, both filed into the same Vorgang.
		for (const n of ["One", "Two"]) {
			const b = createMockTFile(`Besprechungen/${n}.md`);
			app.vault.register(b, "");
			app.metadataCache.setFrontmatter(b.path, {
				tags: ["Besprechung"],
				title: "Compliance & IT",
				filed_into: "[[Vorgang - Informationssicherheit]]",
				filed_at: "2026-04-28T11:52:56.436Z",
			});
		}
		// The candidate section note.
		const vorgang = createMockTFile("Vorgänge/Vorgang - Informationssicherheit.md", {
			basename: "Vorgang - Informationssicherheit",
		});
		app.vault.register(vorgang, "");
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });
		// The active besprechung being filed.
		const active = createMockTFile("Besprechungen/Besprechung - Compliance & IT, 30.06.2026.md", {
			basename: "Besprechung - Compliance & IT, 30.06.2026",
		});
		app.vault.register(active, "");
		app.metadataCache.setFrontmatter(active.path, { tags: ["Besprechung"], title: "Compliance & IT" });
		app.workspace.activeFile = active;

		const { plugin } = makeFeature(app);
		plugin.commands.get("besprechung-file-this")?.callback?.();

		expect(constructed).toHaveLength(1);
		expect((constructed[0].suggestions as string[])[0]).toBe("Vorgang - Informationssicherheit");
	});

	it("recomputes suggestions per besprechung in the pending walk", () => {
		const app = createMockApp({});
		const pending = createMockTFile("Besprechungen/Besprechung - Compliance & IT, 30.06.2026.md", {
			basename: "Besprechung - Compliance & IT, 30.06.2026",
			ctime: 100,
		});
		app.vault.register(pending, "");
		app.metadataCache.setFrontmatter(pending.path, {
			tags: ["Besprechung", "todo"],
			title: "Compliance & IT",
		});
		// A prior filing establishing the pattern.
		const prior = createMockTFile("Besprechungen/Prior.md");
		app.vault.register(prior, "");
		app.metadataCache.setFrontmatter(prior.path, {
			tags: ["Besprechung"],
			title: "Compliance & IT",
			filed_into: "[[Vorgang - Informationssicherheit]]",
			filed_at: "2026-04-28T11:52:56.436Z",
		});
		const vorgang = createMockTFile("Vorgänge/Vorgang - Informationssicherheit.md", {
			basename: "Vorgang - Informationssicherheit",
		});
		app.vault.register(vorgang, "");
		app.metadataCache.setFrontmatter(vorgang.path, { tags: ["Vorgang"] });

		const { plugin } = makeFeature(app);
		plugin.commands.get("besprechung-file-pending")?.callback?.();

		expect(constructed).toHaveLength(1);
		expect((constructed[0].suggestions as string[])[0]).toBe("Vorgang - Informationssicherheit");
	});

	it("degrades to empty suggestions and warns when corpus-gathering throws", () => {
		const app = createMockApp({});
		const active = createMockTFile("Besprechungen/Active.md");
		app.vault.register(active, "");
		app.metadataCache.setFrontmatter(active.path, { tags: ["Besprechung"] });
		app.workspace.activeFile = active;
		app.vault.getMarkdownFiles = vi.fn(() => {
			throw new Error("boom");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const { plugin } = makeFeature(app);
		plugin.commands.get("besprechung-file-this")?.callback?.();

		expect(constructed).toHaveLength(1);
		expect(constructed[0].suggestions).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe("BesprechungFeature.buildFilingCorpus", () => {
	it("excludes the besprechung currently being filed", () => {
		const app = createMockApp({});
		const self = createMockTFile("Besprechungen/Self.md");
		const other = createMockTFile("Besprechungen/Other.md");
		for (const f of [self, other]) {
			app.vault.register(f, "");
			app.metadataCache.setFrontmatter(f.path, {
				tags: ["Besprechung"],
				filed_into: "[[Vorgang - X]]",
				filed_at: "2026-04-28T11:52:56.436Z",
			});
		}
		const { feature } = makeFeature(app);
		const corpus = (feature as unknown as FeaturePrivates).buildFilingCorpus(self);
		expect(corpus).toHaveLength(1);
		expect(corpus.every((r) => r.target === "Vorgang - X")).toBe(true);
	});

	it("falls back to the basename when frontmatter title is absent", () => {
		const app = createMockApp({});
		const b = createMockTFile("Besprechungen/No Title Note.md", { basename: "No Title Note" });
		app.vault.register(b, "");
		app.metadataCache.setFrontmatter(b.path, {
			tags: ["Besprechung"],
			filed_into: "[[Vorgang - X]]",
		});
		const other = createMockTFile("Besprechungen/Other.md");
		const { feature } = makeFeature(app);
		const corpus = (feature as unknown as FeaturePrivates).buildFilingCorpus(other);
		expect(corpus[0].rawTitle).toBe("No Title Note");
	});

	it("strips a |alias from the filed_into target", () => {
		const app = createMockApp({});
		const b = createMockTFile("Besprechungen/Aliased.md");
		app.vault.register(b, "");
		app.metadataCache.setFrontmatter(b.path, {
			tags: ["Besprechung"],
			filed_into: "[[Vorgang - X|Some Alias]]",
		});
		const other = createMockTFile("Besprechungen/Other.md");
		const { feature } = makeFeature(app);
		const corpus = (feature as unknown as FeaturePrivates).buildFilingCorpus(other);
		expect(corpus[0].target).toBe("Vorgang - X");
	});

	it("returns null filedAt when filed_at is absent", () => {
		const app = createMockApp({});
		const b = createMockTFile("Besprechungen/Undated.md");
		app.vault.register(b, "");
		app.metadataCache.setFrontmatter(b.path, {
			tags: ["Besprechung"],
			filed_into: "[[Vorgang - X]]",
		});
		const other = createMockTFile("Besprechungen/Other.md");
		const { feature } = makeFeature(app);
		const corpus = (feature as unknown as FeaturePrivates).buildFilingCorpus(other);
		expect(corpus[0].filedAt).toBeNull();
	});
});
