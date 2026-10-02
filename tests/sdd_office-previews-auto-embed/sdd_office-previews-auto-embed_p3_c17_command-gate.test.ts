import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

const ID = "office-previews-embed-missing";
const NAME = "Office-Vorschauen: Fehlende Einbettungen ergänzen";

describe("SDD office-previews-auto-embed p3 c17", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	it("registers the backfill command on macOS with its German name", () => {
		h = createHarness();
		h.layoutReady();

		const cmd = h.plugin.commands.get(ID);
		expect(cmd).toBeDefined();
		expect(cmd?.name).toBe(NAME);
	});

	it("does not register the command on a non-macOS platform", async () => {
		h = createHarness({ platform: { isMacOS: false } });
		await h.start();

		expect(h.plugin.commands.has(ID)).toBe(false);
	});

	it("does not register the command without the desktop app", async () => {
		h = createHarness({ platform: { isDesktopApp: false } });
		await h.start();

		expect(h.plugin.commands.has(ID)).toBe(false);
	});

	it("lists the command in the help entries with a non-empty German description", () => {
		h = createHarness();

		const entry = h.feature.helpEntries().find((e) => e.commandId === ID);
		expect(entry).toBeDefined();
		expect(entry?.displayName).toBe(NAME);
		expect(entry?.description.trim().length).toBeGreaterThan(0);
	});
});
