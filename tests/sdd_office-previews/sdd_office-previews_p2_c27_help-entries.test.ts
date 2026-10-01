import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../helpers/office-previews-harness";

describe("SDD office-previews p2 c27", () => {
	let h: Harness | undefined;

	afterEach(() => {
		h?.dispose();
		h = undefined;
	});

	it("returns an entry for each of the two commands with their names and a description", () => {
		h = createHarness();
		const entries = h.feature.helpEntries();
		const byId = new Map(entries.map((e) => [e.commandId, e]));

		const render = byId.get("office-previews-render-active");
		const status = byId.get("office-previews-status");
		expect(render).toBeDefined();
		expect(status).toBeDefined();
		expect(render?.displayName).toBe("Office-Vorschau: Aktuelles Dokument jetzt erzeugen");
		expect(status?.displayName).toBe("Office-Vorschau: Status anzeigen");
		expect(render?.description.trim().length).toBeGreaterThan(0);
		expect(status?.description.trim().length).toBeGreaterThan(0);
	});

	it("lists only registered command ids, and every registered command has an entry", () => {
		h = createHarness();
		const entryIds = h.feature.helpEntries().map((e) => e.commandId).sort();
		const commandIds = [...h.plugin.commands.keys()].sort();
		expect(entryIds).toEqual(commandIds);
	});
});
