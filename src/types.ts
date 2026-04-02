import type LuKitPlugin from "./main";
import type { DateLocale } from "./shared/date-format";

export interface WorkDiarySettings {
	diaryNotePath: string;
}

export interface BesprechungSettings {
	folderPath: string;
	sectionHeadings: string[];
}

export interface LuKitFeature {
	id: string;
	onload(plugin: LuKitPlugin): void;
	onunload(): void;
	renderSettings?(containerEl: HTMLElement, plugin: LuKitPlugin): void;
}

export interface LuKitSettings {
	dateLocale: DateLocale;
	workDiary: WorkDiarySettings;
	besprechung: BesprechungSettings;
}

export const LUKIT_ICON_ID = "lukit-logo";

export const DEFAULT_SETTINGS: LuKitSettings = {
	dateLocale: "de",
	workDiary: {
		diaryNotePath: "",
	},
	besprechung: {
		folderPath: "",
		sectionHeadings: ["Nächste Schritte", "Zusammenfassung"],
	},
};

export function mergeSettings(saved: Partial<LuKitSettings>): LuKitSettings {
	return {
		...DEFAULT_SETTINGS,
		...saved,
		workDiary: { ...DEFAULT_SETTINGS.workDiary, ...(saved.workDiary ?? {}) },
		besprechung: { ...DEFAULT_SETTINGS.besprechung, ...(saved.besprechung ?? {}) },
	};
}
