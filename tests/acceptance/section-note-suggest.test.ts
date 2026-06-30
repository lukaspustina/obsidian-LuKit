import { describe, it, expect, vi } from "vitest";
import { SectionNoteSuggestModal } from "../../src/shared/modals/section-note-suggest";
import { createMockApp, createMockTFile } from "../helpers/obsidian-mocks";

const SECTION_TAGS: ReadonlySet<string> = new Set(["Vorgang", "Person", "Bestellung", "Bewerbung"]);

// Builds an app with three Vorgang notes A (newest), B, C (oldest), each tagged.
function appWithThreeNotes() {
	const app = createMockApp();
	const files = [
		createMockTFile("Vorgänge/Vorgang - A.md", { basename: "Vorgang - A", mtime: 300 }),
		createMockTFile("Vorgänge/Vorgang - B.md", { basename: "Vorgang - B", mtime: 200 }),
		createMockTFile("Vorgänge/Vorgang - C.md", { basename: "Vorgang - C", mtime: 100 }),
	];
	for (const f of files) {
		app.vault.register(f, "");
		app.metadataCache.setFrontmatter(f.path, { tags: ["Vorgang"] });
	}
	return app;
}

function texts(modal: SectionNoteSuggestModal): string[] {
	return modal.getItems().map((item) => modal.getItemText(item));
}

describe("SectionNoteSuggestModal pinned suggestions", () => {
	it("renders the first item as the pinned suggestion row", () => {
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			suggestions: ["Vorgang - A"],
		});
		expect(texts(modal)[0]).toBe("★ Vorgang - A (suggested)");
	});

	it("does not repeat a pinned file in the lower list (appears exactly once)", () => {
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			suggestions: ["Vorgang - A"],
		});
		const all = texts(modal);
		expect(all).toEqual(["★ Vorgang - A (suggested)", "Vorgang - B", "Vorgang - C"]);
		expect(all.filter((t) => t === "Vorgang - A")).toHaveLength(0);
	});

	it("invokes onPick with the corresponding TFile when a pinned row is chosen", () => {
		const app = appWithThreeNotes();
		const onPick = vi.fn();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick,
			suggestions: ["Vorgang - A"],
		});
		modal.onChooseItem(modal.getItems()[0]);
		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick.mock.calls[0][0].basename).toBe("Vorgang - A");
	});

	it("orders multiple pinned rows before the sentinels, in suggestion order", () => {
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			onSkip: () => undefined,
			suggestions: ["Vorgang - A", "Vorgang - B"],
		});
		const all = texts(modal);
		expect(all[0]).toBe("★ Vorgang - A (suggested)");
		expect(all[1]).toBe("★ Vorgang - B (suggested)");
		// the Skip sentinel follows the pinned rows
		expect(all[2]).toContain("Skip");
	});

	it("produces no pinned row for a suggestion that resolves to no candidate file", () => {
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			suggestions: ["Vorgang - Ghost"],
		});
		const all = texts(modal);
		expect(all.some((t) => t.includes("suggested"))).toBe(false);
		expect(all).toEqual(["Vorgang - A", "Vorgang - B", "Vorgang - C"]);
	});

	it("is unchanged from current behaviour when suggestions is absent", () => {
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			onSkip: () => undefined,
		});
		const all = texts(modal);
		expect(all[0]).toContain("Skip");
		expect(all.slice(1)).toEqual(["Vorgang - A", "Vorgang - B", "Vorgang - C"]);
	});

	it("does not fire onCancel when an item was chosen, even if onClose runs first", () => {
		vi.useFakeTimers();
		const onCancel = vi.fn();
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			onCancel,
		});
		// Reproduce the observed Obsidian order: onClose() before onChooseItem().
		modal.onClose();
		modal.onChooseItem(modal.getItems()[0]);
		vi.runAllTimers();
		expect(onCancel).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("fires onCancel when the modal closes without a choice and no skip is available", () => {
		vi.useFakeTimers();
		const onCancel = vi.fn();
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			onCancel,
		});
		modal.onClose();
		vi.runAllTimers();
		expect(onCancel).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it("treats a dismiss as skip (not cancel) when onSkip is available", () => {
		vi.useFakeTimers();
		const onSkip = vi.fn();
		const onCancel = vi.fn();
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			onSkip,
			onCancel,
		});
		modal.onClose();
		vi.runAllTimers();
		expect(onSkip).toHaveBeenCalledTimes(1);
		expect(onCancel).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("treats an empty suggestions array identically to absent", () => {
		const app = appWithThreeNotes();
		const modal = new SectionNoteSuggestModal(app as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			suggestions: [],
		});
		expect(texts(modal)).toEqual(["Vorgang - A", "Vorgang - B", "Vorgang - C"]);
	});
});
