import { addIcon, Plugin } from "obsidian";
import { LuKitSettingTab } from "./settings";
import type { LuKitFeature, LuKitSettings } from "./types";
import { DEFAULT_SETTINGS, LUKIT_ICON_ID } from "./types";
import { WorkDiaryFeature } from "./features/work-diary/work-diary-feature";
import { VorgangFeature } from "./features/vorgang/vorgang-feature";
import { BesprechungFeature } from "./features/besprechung/besprechung-feature";
import { MigrationFeature } from "./features/migration/migration-feature";
import { HelpModal } from "./shared/modals/help-modal";

const LUKIT_ICON_SVG = `<rect x="18.75" y="18.75" width="18.75" height="18.75" rx="3.5" fill="currentColor"/><rect x="18.75" y="40.625" width="18.75" height="18.75" rx="3.5" fill="currentColor"/><rect x="18.75" y="62.5" width="18.75" height="18.75" rx="3.5" fill="currentColor"/><rect x="40.625" y="62.5" width="18.75" height="18.75" rx="3.5" fill="currentColor"/><rect x="62.5" y="62.5" width="18.75" height="18.75" rx="3.5" fill="currentColor"/>`;

export default class LuKitPlugin extends Plugin {
	settings!: LuKitSettings;
	features: LuKitFeature[] = [];

	async onload(): Promise<void> {
		addIcon(LUKIT_ICON_ID, LUKIT_ICON_SVG);
		await this.loadSettings();

		this.features.push(new WorkDiaryFeature());
		this.features.push(new VorgangFeature());
		this.features.push(new BesprechungFeature());
		this.features.push(new MigrationFeature());

		for (const feature of this.features) {
			feature.onload(this);
		}

		this.addCommand({
			id: "lukit-help",
			name: "Help",
			icon: LUKIT_ICON_ID,
			callback: () => new HelpModal(this.app).open(),
		});

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
