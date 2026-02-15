import type LuKitPlugin from "./main";
import type { WorkDiarySettings } from "./features/work-diary/work-diary-settings";
import type { BesprechungSettings } from "./features/besprechung/besprechung-settings";
import type { DateLocale } from "./shared/date-format";

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
