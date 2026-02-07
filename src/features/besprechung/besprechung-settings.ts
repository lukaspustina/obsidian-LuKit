import { Setting } from "obsidian";
import type LuKitPlugin from "../../main";

export interface BesprechungSettings {
	folderPath: string;
}

export function renderBesprechungSettings(
	containerEl: HTMLElement,
	plugin: LuKitPlugin
): void {
	containerEl.createEl("h3", { text: "Besprechung" });

	new Setting(containerEl)
		.setName("Besprechung folder path")
		.setDesc("Folder containing Besprechung notes (e.g. Meetings/Besprechungen)")
		.addText((text) =>
			text
				.setPlaceholder("path/to/besprechungen")
				.setValue(plugin.settings.besprechung.folderPath)
				.onChange(async (value) => {
					plugin.settings.besprechung.folderPath = value.trim();
					await plugin.saveSettings();
				})
		);
}
