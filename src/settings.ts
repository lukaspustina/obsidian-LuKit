import { App, PluginSettingTab, Setting } from "obsidian";
import type LuKitPlugin from "./main";
import { DATE_LOCALE_LABELS } from "./shared/date-format";
import type { DateLocale } from "./shared/date-format";

export class LuKitSettingTab extends PluginSettingTab {
	private plugin: LuKitPlugin;

	constructor(app: App, plugin: LuKitPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "LuKit-Einstellungen" });

		containerEl.createEl("h3", { text: "Allgemein" });

		new Setting(containerEl)
			.setName("Datumsformat")
			.setDesc("Gilt für Tagebuch-Überschriften, Vorgang-Abschnitte und Erinnerungen.")
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(DATE_LOCALE_LABELS)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.plugin.settings.dateLocale);
				dropdown.onChange(async (value) => {
					this.plugin.settings.dateLocale = value as DateLocale;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Abgeschlossen-Tag")
			.setDesc("Notizen mit diesem Frontmatter-Tag erscheinen nicht mehr in Ablage-Pickern und Vorschlägen (leer = deaktiviert)")
			.addText((text) =>
				text
					.setPlaceholder("Done")
					.setValue(this.plugin.settings.doneTag)
					.onChange(async (value) => {
						this.plugin.settings.doneTag = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		for (const feature of this.plugin.features) {
			if (feature.renderSettings) {
				feature.renderSettings(containerEl, this.plugin);
			}
		}
	}
}
