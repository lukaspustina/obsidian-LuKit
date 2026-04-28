import { Setting } from "obsidian";
import type LuKitPlugin from "../../main";
import type { PendingOrder } from "../../types";

export type { BesprechungSettings } from "../../types";

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

	new Setting(containerEl)
		.setName("Pending tag")
		.setDesc("Frontmatter tag marking unfiled Besprechungen (used by 'File pending notes')")
		.addText((text) =>
			text
				.setPlaceholder("todo")
				.setValue(plugin.settings.besprechung.pendingTag)
				.onChange(async (value) => {
					plugin.settings.besprechung.pendingTag = value.trim();
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Pending order")
		.setDesc("Order in which 'File pending notes' walks the backlog")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("oldest", "Oldest first")
				.addOption("newest", "Newest first")
				.setValue(plugin.settings.besprechung.pendingOrder)
				.onChange(async (value) => {
					plugin.settings.besprechung.pendingOrder = value as PendingOrder;
					await plugin.saveSettings();
				})
		);
}
