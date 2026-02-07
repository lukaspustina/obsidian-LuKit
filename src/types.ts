import type LuKitPlugin from "./main";
import type { WorkDiarySettings } from "./features/work-diary/diary-settings";

export interface LuKitFeature {
	id: string;
	onload(plugin: LuKitPlugin): void;
	onunload(): void;
	renderSettings?(containerEl: HTMLElement, plugin: LuKitPlugin): void;
}

export interface LuKitSettings {
	workDiary: WorkDiarySettings;
}

export const DEFAULT_SETTINGS: LuKitSettings = {
	workDiary: {
		diaryNotePath: "",
	},
};
