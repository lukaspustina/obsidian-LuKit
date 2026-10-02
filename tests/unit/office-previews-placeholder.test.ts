import { describe, it, expect, afterEach } from "vitest";
import {
	SUPPORTED_EXTENSIONS,
	decodeMarker,
	encodeMarker,
	placeholderSvg,
} from "../../src/features/office-previews/office-previews-engine";
import { createHarness, markedPreview, sha256Of, type Harness } from "../helpers/office-previews-harness";

// When no preview can be rendered, a "Keine Vorschau verfügbar" placeholder per
// file type takes its place (operator decision 2026-10-02): marked with the
// document's fingerprint and a placeholder flag, it blocks re-rendering like the
// failure memory, on every device, until the document changes or "render now"
// is used; a dropped document gets the placeholder embedded plus the Notice.

describe("office-previews placeholder — engine", () => {
	it("draws a labelled portrait page for documents and a 16:9 card for presentations", () => {
		const doc = placeholderSvg("Projekte/Angebot.DOCX");
		expect(doc).toContain('width="424" height="600"');
		expect(doc).toContain(">DOCX<");
		expect(doc).toContain("Keine Vorschau verfügbar");
		const slide = placeholderSvg("Folien.pptx");
		expect(slide).toContain('width="960" height="540"');
		expect(slide).toContain(">PPTX<");
	});

	it("has a placeholder for every supported extension", () => {
		for (const ext of SUPPORTED_EXTENSIONS) {
			expect(placeholderSvg(`x.${ext}`)).toContain(`>${ext.toUpperCase()}<`);
		}
	});

	it("round-trips the placeholder flag and ignores anything but true", () => {
		const m = { version: 1 as const, sha256: "a".repeat(64), placeholder: true as const };
		expect(decodeMarker(encodeMarker(m))).toEqual(m);
		expect(encodeMarker({ version: 1, sha256: "b" })).not.toContain("placeholder");
		expect(decodeMarker(JSON.stringify({ version: 1, sha256: "c", placeholder: "yes" }))).toEqual({ version: 1, sha256: "c" });
	});
});

describe("office-previews placeholder — feature", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	it("writes a marked placeholder when the render fails", async () => {
		h = createHarness();
		h.renderer.failWith("timeout");
		h.addSource("Projekte/Angebot.docx", "body");
		await h.start();

		expect(h.renderer.placeholderCalls).toEqual([{ sourcePath: "Projekte/Angebot.docx", kind: "png" }]);
		expect(h.previewMarker("Projekte/Angebot.docx")).toEqual({ version: 1, sha256: sha256Of("body"), placeholder: true });
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 1 });
	});

	it("uses the JPEG placeholder for a presentation", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.addSource("Folien.pptx", "slides");
		await h.start();

		expect(h.renderer.placeholderCalls).toEqual([{ sourcePath: "Folien.pptx", kind: "jpg" }]);
		const bytes = h.preview("Folien.pptx");
		expect([bytes?.[0], bytes?.[1]]).toEqual([0xff, 0xd8]);
	});

	it("is not re-rendered on another device and not counted as current there", async () => {
		h = createHarness({ storage: new Map() });
		h.addSource("Angebot.docx", "body");
		h.putFile(h.mirror("Angebot.docx"), markedPreview("Angebot.docx", sha256Of("body")));
		// Rewrite the fixture's marker into a placeholder marker for the same fingerprint.
		const { writeMarkerPng } = await import("../../src/features/office-previews/office-previews-engine");
		const { tinyPng } = await import("../helpers/office-previews-harness");
		h.putFile(h.mirror("Angebot.docx"), writeMarkerPng(tinyPng(3), { version: 1, sha256: sha256Of("body"), placeholder: true }));
		await h.start();

		expect(h.renderer.calls).toHaveLength(0);
		expect(await h.status()).toEqual({ current: 0, queued: 0, failed: 0 });
	});

	it("is re-rendered once the document changes, and replaced by the real preview", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.addSource("Angebot.docx", "v1");
		await h.start();
		expect(h.previewMarker("Angebot.docx")?.placeholder).toBe(true);

		h.renderer.result = (_a, kind) => ({ ok: true, bytes: markedPreview(kind === "jpg" ? "x.pptx" : "x.docx", "0").slice(0) });
		h.changeSource("Angebot.docx", "v2");
		await h.drain();

		expect(h.previewMarker("Angebot.docx")).toEqual({ version: 1, sha256: sha256Of("v2") });
	});

	it("is re-rendered by the render-now command on its preview image", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.addSource("Angebot.docx", "body");
		await h.start();
		h.renderer.result = (_a, kind) => ({ ok: true, bytes: markedPreview(kind === "jpg" ? "x.pptx" : "x.docx", "0").slice(0) });

		h.setActiveFile(h.mirror("Angebot.docx"));
		await h.runCommand("office-previews-render-active");

		expect(h.renderer.calls).toHaveLength(2);
		expect(h.previewMarker("Angebot.docx")).toEqual({ version: 1, sha256: sha256Of("body") });
	});

	it("keeps an existing real preview when a re-render fails", async () => {
		h = createHarness();
		h.addSource("Angebot.docx", "v2");
		const old = markedPreview("Angebot.docx", sha256Of("v1"));
		h.putFile(h.mirror("Angebot.docx"), old);
		h.renderer.failWith("exit");
		await h.start();

		expect(h.renderer.calls).toHaveLength(1);
		expect(h.renderer.placeholderCalls).toHaveLength(0);
		expect(h.read(h.mirror("Angebot.docx"))).toEqual(old);
	});

	it("writes nothing when the placeholder itself cannot be rasterized", async () => {
		h = createHarness();
		h.renderer.failWith("exit");
		h.renderer.placeholderResult = () => ({ ok: false, reason: "exit" });
		h.addSource("Angebot.docx", "body");
		await h.start();

		expect(h.preview("Angebot.docx")).toBeUndefined();
		expect((await h.status()).failed).toBe(1);
	});

	it("embeds the placeholder of a dropped document whose render failed, with exactly one Notice", async () => {
		h = createHarness();
		await h.start();
		h.putFile("Notizen/N.md", "Intro\n![[Angebot.docx]]\n");
		const ed = h.openNote("Notizen/N.md");
		h.renderer.failWith("timeout");

		h.drop("Notizen/N.md", ["Angebot.docx"]);
		h.createSource("_resources/Angebot.docx");
		await h.settle();

		expect(ed.getValue()).toBe("Intro\n[[Angebot.docx]]\n![[Angebot.docx.png]]\n");
		expect(h.previewMarker("_resources/Angebot.docx")?.placeholder).toBe(true);
		expect(h.notices().filter((n) => n.startsWith("Office-Vorschau fehlgeschlagen"))).toEqual(["Office-Vorschau fehlgeschlagen: Angebot.docx"]);
	});
});
