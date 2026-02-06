import { App, PluginSettingTab } from "obsidian";
import type LukKitPlugin from "./main";

export class LukKitSettingTab extends PluginSettingTab {
	private plugin: LukKitPlugin;

	constructor(app: App, plugin: LukKitPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "LukKit Settings" });

		for (const feature of this.plugin.features) {
			if (feature.renderSettings) {
				feature.renderSettings(containerEl, this.plugin);
			}
		}
	}
}
