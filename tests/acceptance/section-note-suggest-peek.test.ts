import { describe, it, expect } from "vitest";
import { SectionNoteSuggestModal } from "../../src/shared/modals/section-note-suggest";
import { createMockApp, createMockTFile } from "../helpers/obsidian-mocks";

const SECTION_TAGS: ReadonlySet<string> = new Set(["Vorgang"]);

function appWithOneNote() {
	const app = createMockApp();
	const file = createMockTFile("Vorgänge/Vorgang - A.md", { basename: "Vorgang - A", mtime: 1 });
	app.vault.register(file, "");
	app.metadataCache.setFrontmatter(file.path, { tags: ["Vorgang"] });
	return app;
}

// The panel hangs off modalEl, so these assertions read the modal root, not contentEl.
function modalRoot(modal: SectionNoteSuggestModal): { classes: Set<string>; children: { cls: string; texts: string[] }[] } {
	return (modal as unknown as { modalEl: { classes: Set<string>; children: { cls: string; texts: string[] }[] } }).modalEl;
}

describe("SectionNoteSuggestModal peek panel", () => {
	it("renders the preview panel and switches the picker to the two-column layout", () => {
		const modal = new SectionNoteSuggestModal(appWithOneNote() as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
			previewText: "Von: Max Mustermann\nBetreff: Angebot\n\nHallo,",
		});
		modal.onOpen();

		const root = modalRoot(modal);
		expect(root.classes.has("lukit-peek-modal")).toBe(true);
		const panel = root.children.find((c) => c.cls === "lukit-email-peek");
		expect(panel).toBeDefined();
		expect(panel?.texts.join("")).toContain("Betreff: Angebot");
	});

	it("stays single-column without a previewText", () => {
		const modal = new SectionNoteSuggestModal(appWithOneNote() as never, SECTION_TAGS, {
			placeholder: "x",
			onPick: () => undefined,
		});
		modal.onOpen();

		const root = modalRoot(modal);
		expect(root.classes.has("lukit-peek-modal")).toBe(false);
		expect(root.children.some((c) => c.cls === "lukit-email-peek")).toBe(false);
	});
});
