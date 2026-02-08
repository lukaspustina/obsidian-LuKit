import type LuKitPlugin from "./main";
import type { WorkDiarySettings } from "./features/work-diary/work-diary-settings";
import type { BesprechungSettings } from "./features/besprechung/besprechung-settings";

export interface LuKitFeature {
	id: string;
	onload(plugin: LuKitPlugin): void;
	onunload(): void;
	renderSettings?(containerEl: HTMLElement, plugin: LuKitPlugin): void;
}

export interface LuKitSettings {
	workDiary: WorkDiarySettings;
	besprechung: BesprechungSettings;
}

export const LUKIT_ICON_ID = "lukit-logo";

export const DEFAULT_SETTINGS: LuKitSettings = {
	workDiary: {
		diaryNotePath: "",
	},
	besprechung: {
		folderPath: "",
		sectionHeadings: ["Nächste Schritte", "Zusammenfassung"],
	},
};
