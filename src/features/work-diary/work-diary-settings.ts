import { Setting } from "obsidian";
import type LuKitPlugin from "../../main";

export type { WorkDiarySettings } from "../../types";

export function renderWorkDiarySettings(
	containerEl: HTMLElement,
	plugin: LuKitPlugin
): void {
	containerEl.createEl("h3", { text: "Arbeitstagebuch" });

	new Setting(containerEl)
		.setName("Pfad zur Tagebuch-Notiz")
		.setDesc("Pfad zur Arbeitstagebuch-Notiz (z. B. Arbeit/Tagebuch.md)")
		.addText((text) =>
			text
				.setPlaceholder("Pfad/zur/Tagebuch.md")
				.setValue(plugin.settings.workDiary.diaryNotePath)
				.onChange(async (value) => {
					plugin.settings.workDiary.diaryNotePath = value.trim();
					await plugin.saveSettings();
				})
		);
}
