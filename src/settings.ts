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
		containerEl.createEl("h2", { text: "LuKit Settings" });

		containerEl.createEl("h3", { text: "General" });

		new Setting(containerEl)
			.setName("Date format")
			.setDesc("Affects diary headers, Vorgang sections, and reminders.")
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

		for (const feature of this.plugin.features) {
			if (feature.renderSettings) {
				feature.renderSettings(containerEl, this.plugin);
			}
		}
	}
}
