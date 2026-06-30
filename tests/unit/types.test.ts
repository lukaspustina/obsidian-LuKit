import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mergeSettings, DEFAULT_SETTINGS } from "../../src/types";

describe("mergeSettings", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("returns defaults for empty data", () => {
		const merged = mergeSettings({});
		expect(merged).toEqual(DEFAULT_SETTINGS);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("merges partial besprechung settings without losing defaults", () => {
		const merged = mergeSettings({
			besprechung: { folderPath: "Meetings" } as Partial<LuKitSettingsLike>["besprechung"],
		} as Parameters<typeof mergeSettings>[0]);
		expect(merged.besprechung.folderPath).toBe("Meetings");
		expect(merged.besprechung.sectionHeadings).toEqual(DEFAULT_SETTINGS.besprechung.sectionHeadings);
		expect(merged.besprechung.pendingTag).toBe(DEFAULT_SETTINGS.besprechung.pendingTag);
		expect(merged.besprechung.pendingOrder).toBe(DEFAULT_SETTINGS.besprechung.pendingOrder);
	});

	it("falls back to default and warns when dateLocale is invalid", () => {
		const merged = mergeSettings({ dateLocale: "fr" } as Parameters<typeof mergeSettings>[0]);
		expect(merged.dateLocale).toBe("de");
		expect(warnSpy).toHaveBeenCalledOnce();
		expect(warnSpy.mock.calls[0][0]).toContain("fr");
	});

	it("accepts valid dateLocale values", () => {
		expect(mergeSettings({ dateLocale: "de" }).dateLocale).toBe("de");
		expect(mergeSettings({ dateLocale: "en" }).dateLocale).toBe("en");
		expect(mergeSettings({ dateLocale: "iso" }).dateLocale).toBe("iso");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("performs full round-trip with all fields", () => {
		const input = {
			dateLocale: "iso" as const,
			workDiary: { diaryNotePath: "Diary.md" },
			besprechung: {
				folderPath: "Meetings",
				sectionHeadings: ["Action Items"],
				pendingTag: "open",
				pendingOrder: "newest" as const,
				selfNameStopwords: ["Mustermann"],
			},
		};
		const merged = mergeSettings(input);
		expect(merged).toEqual(input);
	});
});

// Local helper type for referencing settings shape without importing the
// full LuKitSettings (avoids forcing test to import `LuKitPlugin`).
type LuKitSettingsLike = {
	besprechung: {
		folderPath: string;
		sectionHeadings: string[];
		pendingTag: string;
		pendingOrder: "oldest" | "newest";
	};
};
