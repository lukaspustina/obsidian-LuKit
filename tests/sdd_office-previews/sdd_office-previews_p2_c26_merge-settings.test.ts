import { describe, it, expect } from "vitest";
import { mergeSettings } from "../../src/types";
import { DEFAULT_OFFICE_PREVIEW_SETTINGS } from "../../src/features/office-previews/office-previews-settings";

type OfficeSettings = { enabled: boolean; folder: string };
type SavedInput = Parameters<typeof mergeSettings>[0];

function officeOf(saved: Record<string, unknown>): OfficeSettings {
	const merged = mergeSettings(saved as unknown as SavedInput) as unknown as { officePreviews: OfficeSettings };
	return merged.officePreviews;
}

describe("SDD office-previews p2 c26", () => {
	it("exposes defaults of enabled=false and folder _previews", () => {
		expect(DEFAULT_OFFICE_PREVIEW_SETTINGS).toEqual({ enabled: false, folder: "_previews" });
	});

	it("falls back to defaults when data.json has no officePreviews key", () => {
		expect(officeOf({})).toEqual({ enabled: false, folder: "_previews" });
	});

	it("keeps saved enabled and folder values", () => {
		expect(officeOf({ officePreviews: { enabled: true, folder: "Vorschau/Office" } })).toEqual({
			enabled: true,
			folder: "Vorschau/Office",
		});
	});

	it("fills a missing folder from defaults when only enabled is saved", () => {
		expect(officeOf({ officePreviews: { enabled: true } })).toEqual({ enabled: true, folder: "_previews" });
	});

	it("falls back to _previews for a folder containing a .. segment", () => {
		expect(officeOf({ officePreviews: { enabled: true, folder: "../x" } }).folder).toBe("_previews");
		expect(officeOf({ officePreviews: { enabled: true, folder: "a/../x" } }).folder).toBe("_previews");
	});

	it("falls back to _previews for an empty folder or a first segment starting with a dot", () => {
		expect(officeOf({ officePreviews: { enabled: false, folder: "   " } }).folder).toBe("_previews");
		expect(officeOf({ officePreviews: { enabled: false, folder: ".obsidian/x" } }).folder).toBe("_previews");
	});

	it("normalizes slashes and whitespace in the loaded folder", () => {
		expect(officeOf({ officePreviews: { enabled: false, folder: "  /Vorschau\\\\Office//Sub/ " } }).folder).toBe(
			"Vorschau/Office/Sub",
		);
	});
});
