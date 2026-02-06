import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type LukKitPlugin from "../../main";
import type { LukKitFeature } from "../../types";
import {
	ensureTodayHeader,
	addEntryUnderToday,
	formatDiaryEntry,
	formatTextEntry,
} from "./diary-engine";
import { renderWorkDiarySettings } from "./diary-settings";
import { NoteSuggestModal } from "../../shared/modals/note-suggest";
import { HeadingSuggestModal } from "../../shared/modals/heading-suggest";
import { TextInputModal } from "../../shared/modals/text-input-modal";

export class WorkDiaryFeature implements LukKitFeature {
	id = "work-diary";
	private plugin!: LukKitPlugin;

	onload(plugin: LukKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "ensure-today-header",
			name: "Ensure today's header",
			callback: () => this.ensureTodayHeaderCmd(),
		});

		plugin.addCommand({
			id: "add-diary-entry",
			name: "Add diary entry",
			callback: () => this.addDiaryEntryCmd(),
		});

		plugin.addCommand({
			id: "add-text-entry",
			name: "Add text entry",
			callback: () => this.addTextEntryCmd(),
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LukKitPlugin): void {
		renderWorkDiarySettings(containerEl, plugin);
	}

	private getDiaryFile(): TFile | null {
		const path = this.plugin.settings.workDiary.diaryNotePath;
		if (!path) {
			new Notice("LukKit: No diary note path configured. Set it in Settings → LukKit.");
			return null;
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`LukKit: Diary note not found at "${path}".`);
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

		const content = await this.plugin.app.vault.read(file);
		const { newContent, headerLineIndex } = ensureTodayHeader(content);

		if (newContent !== content) {
			await this.plugin.app.vault.modify(file, newContent);
		}

		await this.openDiaryNote(file, headerLineIndex);
	}

	private addDiaryEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		new NoteSuggestModal(this.plugin.app, (selectedFile) => {
			new HeadingSuggestModal(this.plugin.app, selectedFile, async (heading) => {
				const content = await this.plugin.app.vault.read(file);
				const entry = formatDiaryEntry(
					selectedFile.basename,
					heading,
				);
				const { newContent } = addEntryUnderToday(content, entry);
				await this.plugin.app.vault.modify(file, newContent);
				new Notice("Diary entry added.");
			}).open();
		}).open();
	}

	private addTextEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		new TextInputModal(this.plugin.app, async (text) => {
			const content = await this.plugin.app.vault.read(file);
			const entry = formatTextEntry(text);
			const { newContent } = addEntryUnderToday(content, entry);
			await this.plugin.app.vault.modify(file, newContent);
			new Notice("Text entry added.");
		}).open();
	}
}
