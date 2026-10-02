import { describe, it, expect, afterEach } from "vitest";
import type { TFile } from "obsidian";
import { sourceForPreview } from "../../src/features/office-previews/office-previews-engine";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

// Obsidian cannot open a .docx as the active file (measured 2026-10-02 via
// obsidian-cli), so "render now" is reached from the file explorer's context
// menu, and the command also accepts the active preview image.

interface MenuItemStub {
	title: string;
	click: (() => unknown) | null;
	setTitle(t: string): MenuItemStub;
	setIcon(i: string): MenuItemStub;
	onClick(f: () => unknown): MenuItemStub;
}

function menuStub(): { items: MenuItemStub[]; addItem(cb: (item: MenuItemStub) => unknown): unknown } {
	const items: MenuItemStub[] = [];
	return {
		items,
		addItem(cb) {
			const item: MenuItemStub = {
				title: "",
				click: null,
				setTitle(t) { this.title = t; return this; },
				setIcon() { return this; },
				onClick(f) { this.click = f; return this; },
			};
			cb(item);
			items.push(item);
			return this;
		},
	};
}

const TITLE = "Office-Vorschau jetzt erzeugen";

describe("office-previews render trigger", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	function openMenu(harness: Harness, file: TFile): ReturnType<typeof menuStub> {
		const menu = menuStub();
		for (const fn of harness.workspaceListeners.get("file-menu") ?? []) fn(menu, file, "file-explorer");
		return menu;
	}

	it("maps a preview image back to its source and rejects anything else", () => {
		expect(sourceForPreview("_previews/Projekte/Angebot.docx.png", "_previews")).toBe("Projekte/Angebot.docx");
		expect(sourceForPreview("_previews/Folien.pptx.jpg", "_previews")).toBe("Folien.pptx");
		expect(sourceForPreview("_previews/Folien.pptx.png", "_previews")).toBeNull();
		expect(sourceForPreview("_previews/Bild.png", "_previews")).toBeNull();
		expect(sourceForPreview("Projekte/Angebot.docx.png", "_previews")).toBeNull();
	});

	it("offers a context-menu entry on a source that renders it at once, bypassing the failure memory", async () => {
		h = createHarness();
		const file = h.addSource("Projekte/Angebot.docx", "body");
		h.renderer.failWith("exit");
		await h.start();
		expect((await h.status()).failed).toBe(1);
		h.renderer.result = () => ({ ok: true, bytes: markedPreview("x.docx", "0").slice(0) });

		const menu = openMenu(h, file);
		const item = menu.items.find((i) => i.title === TITLE);
		expect(item).toBeDefined();
		item?.click?.();
		await h.settle();

		expect(h.renderer.renderedPaths()).toEqual(["Projekte/Angebot.docx", "Projekte/Angebot.docx"]);
		expect(h.previewMarker("Projekte/Angebot.docx")?.sha256).toBe(sha256Of("body"));
	});

	it("offers no entry on a non-source file or while the feature is disabled", async () => {
		h = createHarness();
		const note = h.putFile("Notiz.md", "text");
		await h.start();
		expect(openMenu(h, note).items).toEqual([]);
		h.dispose();

		h = createHarness({ enabled: false });
		const src = h.addSource("Angebot.docx");
		await h.start();
		expect(openMenu(h, src).items).toEqual([]);
	});

	it("renders the source of the active preview image with the command", async () => {
		h = createHarness();
		h.addSource("Angebot.docx", "v2");
		h.putFile(h.mirror("Angebot.docx"), markedPreview("Angebot.docx", sha256Of("v1")));
		h.renderer.failWith("exit");
		await h.start();
		h.renderer.result = () => ({ ok: true, bytes: markedPreview("x.docx", "0").slice(0) });
		const before = h.renderer.calls.length;

		h.setActiveFile(h.mirror("Angebot.docx"));
		await h.runCommand("office-previews-render-active");

		expect(h.renderer.renderedPaths().slice(before)).toEqual(["Angebot.docx"]);
		expect(h.previewMarker("Angebot.docx")?.sha256).toBe(sha256Of("v2"));
	});

	it("shows the not-a-source Notice for a preview image whose source is gone", async () => {
		h = createHarness();
		h.putFile("_previews/Weg.docx.png", markedPreview("Weg.docx", "0"));
		await h.start();
		h.setActiveFile("_previews/Weg.docx.png");
		await h.runCommand("office-previews-render-active");
		expect(h.lastNotice()).toBe("Die aktive Datei ist kein unterstütztes Office-Dokument.");
		expect(h.renderer.calls).toHaveLength(0);
	});
});
