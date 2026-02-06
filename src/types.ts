import type LukKitPlugin from "./main";
import type { WorkDiarySettings } from "./features/work-diary/diary-settings";

export interface LukKitFeature {
	id: string;
	onload(plugin: LukKitPlugin): void;
	onunload(): void;
	renderSettings?(containerEl: HTMLElement, plugin: LukKitPlugin): void;
}

export interface LukKitSettings {
	workDiary: WorkDiarySettings;
}

export const DEFAULT_SETTINGS: LukKitSettings = {
	workDiary: {
		diaryNotePath: "",
	},
};
