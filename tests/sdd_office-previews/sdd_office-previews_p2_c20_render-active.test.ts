import { afterEach, describe, expect, it } from "vitest";
import { createHarness, sha256Of, tinyJpeg, tinyPng, type Harness } from "../helpers/office-previews-harness";

const COMMAND = "office-previews-render-active";
const DISABLED_NOTICE = "Office-Vorschauen sind in den Einstellungen ausgeschaltet.";
const NOT_A_SOURCE_NOTICE = "Die aktive Datei ist kein unterstütztes Office-Dokument.";

describe("SDD office-previews p2 c20", () => {
	let h: Harness;

	afterEach(() => {
		h.dispose();
	});

	it("renders a failed source at once, ignoring the failure entry", async () => {
		h = createHarness();
		const path = "Projekte/Angebot.docx";
		const content = "offer content";
		h.addSource(path, content);

		// First pass fails and is recorded in the failure memory.
		h.renderer.failWith("exit");
		await h.start();
		expect(h.renderer.calls).toHaveLength(1);
		expect((await h.status()).failed).toBe(1);
		expect(h.previewMarker(path)?.placeholder).toBe(true); // placeholder since 2026-10-02

		// Renderer recovers; the command bypasses the failure memory and the jitter delay.
		h.renderer.result = (_abs, kind) => ({ ok: true, bytes: kind === "jpg" ? tinyJpeg() : tinyPng() });
		h.setActiveFile(path);
		await h.runCommand(COMMAND);

		expect(h.renderer.calls).toHaveLength(2);
		expect(h.renderer.renderedPaths()[1]).toBe(path);
		expect(h.previewMarker(path)).toEqual({ version: 1, sha256: sha256Of(content) });
	});

	it("shows the German Notice and renders nothing for a non-source active file", async () => {
		h = createHarness();
		h.putFile("Notizen/Liste.txt", "plain text");
		h.setActiveFile("Notizen/Liste.txt");

		await h.runCommand(COMMAND);

		expect(h.lastNotice()).toBe(NOT_A_SOURCE_NOTICE);
		expect(h.renderer.calls).toHaveLength(0);
	});

	it("shows the disabled Notice and renders nothing while the feature is off", async () => {
		h = createHarness({ enabled: false });
		const path = "Projekte/Angebot.docx";
		h.addSource(path);
		h.setActiveFile(path);

		await h.runCommand(COMMAND);

		expect(h.lastNotice()).toBe(DISABLED_NOTICE);
		expect(h.renderer.calls).toHaveLength(0);
		expect(h.preview(path)).toBeUndefined();
	});
});
