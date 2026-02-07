import { Setting } from "obsidian";
import type LuKitPlugin from "../../main";

export interface BesprechungSettings {
	folderPath: string;
	sectionHeadings: string[];
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

	new Setting(containerEl)
		.setName("Section headings")
		.setDesc("Comma-separated h3 headings to extract (e.g. Nächste Schritte, Zusammenfassung)")
		.addText((text) =>
			text
				.setPlaceholder("Nächste Schritte, Zusammenfassung")
				.setValue(plugin.settings.besprechung.sectionHeadings.join(", "))
				.onChange(async (value) => {
					plugin.settings.besprechung.sectionHeadings = value
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s.length > 0);
					await plugin.saveSettings();
				})
		);
}
