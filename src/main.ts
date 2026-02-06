import { Plugin } from "obsidian";
import { LukKitSettingTab } from "./settings";
import type { LukKitFeature, LukKitSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { WorkDiaryFeature } from "./features/work-diary/work-diary-feature";

export default class LukKitPlugin extends Plugin {
	settings!: LukKitSettings;
	features: LukKitFeature[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();

		this.features.push(new WorkDiaryFeature());

		for (const feature of this.features) {
			feature.onload(this);
		}

		this.addSettingTab(new LukKitSettingTab(this.app, this));
	}

	async onunload(): Promise<void> {
		for (const feature of this.features) {
			feature.onunload();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
