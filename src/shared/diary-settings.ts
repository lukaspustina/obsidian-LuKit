import type LuKitPlugin from "../main";

// Single accessor for cross-feature reads of the diary path. Other features
// (vorgang) need the diary path but should not bind to the workDiary settings
// shape directly.
export function getDiaryNotePath(plugin: LuKitPlugin): string {
	return plugin.settings.workDiary.diaryNotePath;
}
