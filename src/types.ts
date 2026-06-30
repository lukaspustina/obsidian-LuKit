import type LuKitPlugin from "./main";
import type { DateLocale } from "./shared/date-format";
import { isDateLocale } from "./shared/date-format";

export interface WorkDiarySettings {
	diaryNotePath: string;
}

export type PendingOrder = "oldest" | "newest";

export interface BesprechungSettings {
	folderPath: string;
	sectionHeadings: string[];
	pendingTag: string;
	pendingOrder: PendingOrder;
	selfNameStopwords: string[];
}

export interface HelpEntry {
	commandId: string;
	displayName: string;
	description: string;
}

export interface LuKitFeature {
	id: string;
	onload(plugin: LuKitPlugin): void;
	onunload(): void;
	renderSettings?(containerEl: HTMLElement, plugin: LuKitPlugin): void;
	helpEntries?(): HelpEntry[];
}

export interface LuKitSettings {
	dateLocale: DateLocale;
	workDiary: WorkDiarySettings;
	besprechung: BesprechungSettings;
}

export const LUKIT_ICON_ID = "lukit-logo";

export const DEFAULT_SETTINGS: LuKitSettings = {
	dateLocale: "de",
	workDiary: {
		diaryNotePath: "",
	},
	besprechung: {
		folderPath: "",
		sectionHeadings: ["Nächste Schritte", "Zusammenfassung"],
		pendingTag: "todo",
		pendingOrder: "oldest",
		selfNameStopwords: [],
	},
};

export function mergeSettings(saved: Partial<LuKitSettings>): LuKitSettings {
	let dateLocale: DateLocale = DEFAULT_SETTINGS.dateLocale;
	if (saved.dateLocale !== undefined) {
		if (isDateLocale(saved.dateLocale)) {
			dateLocale = saved.dateLocale;
		} else {
			console.warn(`LuKit: invalid dateLocale "${saved.dateLocale}" — falling back to "${DEFAULT_SETTINGS.dateLocale}"`);
		}
	}
	return {
		...DEFAULT_SETTINGS,
		...saved,
		dateLocale,
		workDiary: { ...DEFAULT_SETTINGS.workDiary, ...(saved.workDiary ?? {}) },
		besprechung: { ...DEFAULT_SETTINGS.besprechung, ...(saved.besprechung ?? {}) },
	};
}
