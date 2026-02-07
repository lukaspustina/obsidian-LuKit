import { App, PluginSettingTab } from "obsidian";
import type LuKitPlugin from "./main";

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

		for (const feature of this.plugin.features) {
			if (feature.renderSettings) {
				feature.renderSettings(containerEl, this.plugin);
			}
		}
	}
}
