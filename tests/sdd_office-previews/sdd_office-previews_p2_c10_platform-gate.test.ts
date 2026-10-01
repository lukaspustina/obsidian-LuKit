import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";
import { __allTexts, __stubEl } from "../helpers/obsidian-stub";
import type LuKitPlugin from "../../src/main";

const HINT = "Office-Vorschauen sind nur in der Desktop-App auf macOS verfügbar.";

const UNSUPPORTED: { name: string; platform: { isDesktopApp: boolean; isMacOS: boolean } }[] = [
	{ name: "desktop app on a non-macOS platform", platform: { isDesktopApp: true, isMacOS: false } },
	{ name: "macOS without the desktop app", platform: { isDesktopApp: false, isMacOS: true } },
	{ name: "neither desktop app nor macOS", platform: { isDesktopApp: false, isMacOS: false } },
];

describe("SDD office-previews p2 c10", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	for (const { name, platform } of UNSUPPORTED) {
		describe(name, () => {
			it("registers no command, no listener and no timer on load, even when enabled", async () => {
				h = createHarness({ enabled: true, platform });

				expect(h.plugin.commands.size).toBe(0);
				expect(h.plugin.registered).toHaveLength(0);
				expect([...h.vaultListeners.values()].flat()).toHaveLength(0);
				expect([...h.workspaceListeners.values()].flat()).toHaveLength(0);
				expect(h.timersScheduled).toBe(0);

				// Layout ready plus the reconcile delay must still schedule and render nothing.
				h.addSource("Docs/Angebot.docx");
				await h.start();
				expect(h.plugin.commands.size).toBe(0);
				expect([...h.vaultListeners.values()].flat()).toHaveLength(0);
				expect(h.timersScheduled).toBe(0);
				expect(h.renderer.calls).toHaveLength(0);
				expect(h.preview("Docs/Angebot.docx")).toBeUndefined();
			});

			it("renders nothing for create events and drops", async () => {
				h = createHarness({ enabled: true, platform });
				h.layoutReady();

				h.createSource("Angebot.docx");
				h.drop("Note.md", ["Angebot.docx"]);
				await h.drain();

				expect(h.renderer.calls).toHaveLength(0);
				expect(h.files().some((f) => f.startsWith("_previews/"))).toBe(false);
				expect(h.timersScheduled).toBe(0);
			});

			it("shows the German hint without controls in the settings section", () => {
				h = createHarness({ enabled: true, platform });
				const el = __stubEl();

				h.feature.renderSettings(el as unknown as HTMLElement, h.plugin as unknown as LuKitPlugin);

				const texts = __allTexts(el).filter((t) => t.trim() !== "");
				expect(texts).toContain(HINT);
				const controlTags = new Set(["input", "button", "select", "textarea"]);
				const stack = [...(el.children as unknown[])] as { tag: string; children: unknown[] }[];
				while (stack.length > 0) {
					const node = stack.pop() as { tag: string; children: unknown[] };
					expect(controlTags.has(node.tag)).toBe(false);
					stack.push(...(node.children as { tag: string; children: unknown[] }[]));
				}
			});
		});
	}

	it("registers both commands and listeners on a supported platform (control case)", () => {
		h = createHarness({ enabled: true });
		h.layoutReady();

		expect(h.plugin.commands.has("office-previews-render-active")).toBe(true);
		expect(h.plugin.commands.has("office-previews-status")).toBe(true);
		expect(h.vaultListeners.get("create")?.length ?? 0).toBeGreaterThan(0);
	});

	it("does not show the unsupported-platform hint on a supported platform", () => {
		h = createHarness({ enabled: true });
		const el = __stubEl();

		h.feature.renderSettings(el as unknown as HTMLElement, h.plugin as unknown as LuKitPlugin);

		expect(__allTexts(el)).not.toContain(HINT);
	});
});
