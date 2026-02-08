import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature } from "../../types";
import {
	ensureTodayHeader,
	addEntryUnderToday,
	formatDiaryEntry,
	formatTextEntry,
	formatReminderEntry,
	addReminder,
} from "./work-diary-engine";
import { renderWorkDiarySettings } from "./work-diary-settings";
import { NoteSuggestModal } from "../../shared/modals/note-suggest";
import { HeadingSuggestModal } from "../../shared/modals/heading-suggest";
import { TextInputModal } from "../../shared/modals/text-input-modal";

export class WorkDiaryFeature implements LuKitFeature {
	id = "work-diary";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "diary-ensure-today",
			name: "Diary: Ensure today's header",
			icon: LUKIT_ICON_ID,
			callback: () => this.ensureTodayHeaderCmd(),
		});

		plugin.addCommand({
			id: "diary-add-entry",
			name: "Diary: Add linked entry",
			icon: LUKIT_ICON_ID,
			callback: () => this.addDiaryEntryCmd(),
		});

		plugin.addCommand({
			id: "diary-add-text",
			name: "Diary: Add text entry",
			icon: LUKIT_ICON_ID,
			callback: () => this.addTextEntryCmd(),
		});

		plugin.addCommand({
			id: "diary-add-reminder",
			name: "Diary: Add reminder",
			icon: LUKIT_ICON_ID,
			callback: () => this.addReminderCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		renderWorkDiarySettings(containerEl, plugin);
	}

	private getDiaryFile(): TFile | null {
		const path = this.plugin.settings.workDiary.diaryNotePath;
		if (!path) {
			new Notice("LuKit: No diary note path configured. Set it in Settings → LuKit.");
			return null;
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`LuKit: Diary note not found at "${path}".`);
			return null;
		}
		return file;
	}

	private async openDiaryNote(file: TFile, lineIndex: number): Promise<void> {
		const leaf = this.plugin.app.workspace.getLeaf(false) as WorkspaceLeaf;
		await leaf.openFile(file);
		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (editor) {
			const pos = { line: lineIndex + 1, ch: 0 };
			editor.setCursor(pos);
			editor.scrollIntoView({ from: pos, to: pos }, true);
		}
	}

	private async ensureTodayHeaderCmd(): Promise<void> {
		const file = this.getDiaryFile();
		if (!file) return;

		let headerLineIndex = 0;
		let fallback = false;
		await this.plugin.app.vault.process(file, (content) => {
			const result = ensureTodayHeader(content);
			headerLineIndex = result.headerLineIndex;
			fallback = result.fallback;
			return result.newContent;
		});

		if (fallback) {
			new Notice("LuKit: Diary note is missing the third separator (---). Header was appended at end.");
		}

		await this.openDiaryNote(file, headerLineIndex);
	}

	private addDiaryEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		new NoteSuggestModal(this.plugin.app, (selectedFile) => {
			new HeadingSuggestModal(this.plugin.app, selectedFile, async (heading) => {
				const entry = formatDiaryEntry(
					selectedFile.basename,
					heading,
				);
				await this.plugin.app.vault.process(file, (content) => {
					const { newContent } = addEntryUnderToday(content, entry);
					return newContent;
				});
				new Notice("Diary entry added.");
			}).open();
		}).open();
	}

	private addTextEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		new TextInputModal(this.plugin.app, "Diary entry…", async (text) => {
			const entry = formatTextEntry(text);
			await this.plugin.app.vault.process(file, (content) => {
				const { newContent } = addEntryUnderToday(content, entry);
				return newContent;
			});
			new Notice("Text entry added.");
		}).open();
	}

	private addReminderCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		new TextInputModal(this.plugin.app, "Reminder…", async (text) => {
			const entry = formatReminderEntry(text);
			let success = false;
			await this.plugin.app.vault.process(file, (content) => {
				const result = addReminder(content, entry);
				if (!result) {
					return content;
				}
				success = true;
				return result.newContent;
			});
			if (!success) {
				new Notice("LuKit: Diary note is missing the third separator (---). Cannot add reminder.");
				return;
			}
			new Notice("Reminder added.");
		}).open();
	}
}
