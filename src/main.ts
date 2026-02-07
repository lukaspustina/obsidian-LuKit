import { Plugin } from "obsidian";
import { LuKitSettingTab } from "./settings";
import type { LuKitFeature, LuKitSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { WorkDiaryFeature } from "./features/work-diary/work-diary-feature";
import { AbsatzFeature } from "./features/absatz/absatz-feature";
import { BesprechungFeature } from "./features/besprechung/besprechung-feature";

export default class LuKitPlugin extends Plugin {
	settings!: LuKitSettings;
	features: LuKitFeature[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();

		this.features.push(new WorkDiaryFeature());
		this.features.push(new AbsatzFeature());
		this.features.push(new BesprechungFeature());

		for (const feature of this.features) {
			feature.onload(this);
		}

		this.addSettingTab(new LuKitSettingTab(this.app, this));
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
