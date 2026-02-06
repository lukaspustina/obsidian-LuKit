import { Setting } from "obsidian";
import type LukKitPlugin from "../../main";

export interface WorkDiarySettings {
	diaryNotePath: string;
}

export function renderWorkDiarySettings(
	containerEl: HTMLElement,
	plugin: LukKitPlugin
): void {
	containerEl.createEl("h3", { text: "Work Diary" });

	new Setting(containerEl)
		.setName("Diary note path")
		.setDesc("Path to the work diary note (e.g. Work/Diary.md)")
		.addText((text) =>
			text
				.setPlaceholder("path/to/diary.md")
				.setValue(plugin.settings.workDiary.diaryNotePath)
				.onChange(async (value) => {
					plugin.settings.workDiary.diaryNotePath = value.trim();
					await plugin.saveSettings();
				})
		);
}
