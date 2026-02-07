import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type LuKitPlugin from "../../main";
import type { LuKitFeature } from "../../types";
import {
	ensureTodayHeader,
	addEntryUnderToday,
	formatDiaryEntry,
	formatTextEntry,
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
			callback: () => this.ensureTodayHeaderCmd(),
		});

		plugin.addCommand({
			id: "diary-add-entry",
			name: "Diary: Add linked entry",
			callback: () => this.addDiaryEntryCmd(),
		});

		plugin.addCommand({
			id: "diary-add-text",
			name: "Diary: Add text entry",
			callback: () => this.addTextEntryCmd(),
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

		new TextInputModal(this.plugin.app, "Diary entry…", async (text) => {
			const content = await this.plugin.app.vault.read(file);
			const entry = formatTextEntry(text);
			const { newContent } = addEntryUnderToday(content, entry);
			await this.plugin.app.vault.modify(file, newContent);
			new Notice("Text entry added.");
		}).open();
	}
}
