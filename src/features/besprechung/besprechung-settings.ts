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
		.setName("Besprechungs-Ordner")
		.setDesc("Ordner mit Besprechungs-Notizen (z. B. Meetings/Besprechungen)")
		.addText((text) =>
			text
				.setPlaceholder("Pfad/zu/Besprechungen")
				.setValue(plugin.settings.besprechung.folderPath)
				.onChange(async (value) => {
					plugin.settings.besprechung.folderPath = value.trim();
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Abschnitts-Überschriften")
		.setDesc("Kommagetrennte Überschriften (h1–h6), die extrahiert werden (z. B. Nächste Schritte, Zusammenfassung)")
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
		.setName("Offen-Tag")
		.setDesc('Frontmatter-Tag für noch nicht abgelegte Besprechungen (genutzt von „Alle offenen ablegen")')
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
		.setName("Eigene Namen ignorieren")
		.setDesc(
			"Kommagetrennte Namen, die beim Ranking der Ablage-Vorschläge ignoriert werden (z. B. der eigene Name — du bist in jeder Besprechung)"
		)
		.addText((text) =>
			text
				.setPlaceholder("")
				.setValue(plugin.settings.besprechung.selfNameStopwords.join(", "))
				.onChange(async (value) => {
					plugin.settings.besprechung.selfNameStopwords = value
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s.length > 0);
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Reihenfolge")
		.setDesc('Reihenfolge, in der „Alle offenen ablegen" den Rückstand abarbeitet')
		.addDropdown((dropdown) =>
			dropdown
				.addOption("oldest", "Älteste zuerst")
				.addOption("newest", "Neueste zuerst")
				.setValue(plugin.settings.besprechung.pendingOrder)
				.onChange(async (value) => {
					plugin.settings.besprechung.pendingOrder = value as PendingOrder;
					await plugin.saveSettings();
				})
		);
}
