import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type { CachedMetadata, HeadingCache } from "obsidian";
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

		plugin.addCommand({
			id: "diary-add-current-note",
			name: "Diary: Add current note",
			icon: LUKIT_ICON_ID,
			callback: () => this.addCurrentNoteCmd(),
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

		const locale = this.plugin.settings.dateLocale;
		let headerLineIndex = 0;
		let fallback = false;
		await this.plugin.app.vault.process(file, (content) => {
			const result = ensureTodayHeader(content, locale);
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

		const locale = this.plugin.settings.dateLocale;
		new NoteSuggestModal(this.plugin.app, (selectedFile) => {
			new HeadingSuggestModal(this.plugin.app, selectedFile, async (heading) => {
				const entry = formatDiaryEntry(
					selectedFile.basename,
					heading,
				);
				await this.plugin.app.vault.process(file, (content) => {
					const { newContent } = addEntryUnderToday(content, entry, locale);
					return newContent;
				});
				new Notice("Diary entry added.");
			}).open();
		}).open();
	}

	private addTextEntryCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		const locale = this.plugin.settings.dateLocale;
		new TextInputModal(this.plugin.app, "Diary entry…", async (text) => {
			const entry = formatTextEntry(text);
			await this.plugin.app.vault.process(file, (content) => {
				const { newContent } = addEntryUnderToday(content, entry, locale);
				return newContent;
			});
			new Notice("Text entry added.");
		}).open();
	}

	private addReminderCmd(): void {
		const file = this.getDiaryFile();
		if (!file) return;

		const locale = this.plugin.settings.dateLocale;
		new TextInputModal(this.plugin.app, "Reminder…", async (text) => {
			const entry = formatReminderEntry(text, locale);
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

	private async addCurrentNoteCmd(): Promise<void> {
		const diaryFile = this.getDiaryFile();
		if (!diaryFile) return;

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("LuKit: No active note open.");
			return;
		}

		if (activeFile.path === diaryFile.path) {
			new Notice("LuKit: Cannot add the diary note to itself.");
			return;
		}

		const locale = this.plugin.settings.dateLocale;
		const heading = this.getHeadingAtCursor(activeFile);
		const entry = formatDiaryEntry(activeFile.basename, heading);

		await this.plugin.app.vault.process(diaryFile, (content) => {
			const { newContent } = addEntryUnderToday(content, entry, locale);
			return newContent;
		});

		new Notice("Diary entry added.");
	}

	private getHeadingAtCursor(file: TFile): string | null {
		const cache: CachedMetadata | null = this.plugin.app.metadataCache.getFileCache(file);
		if (!cache?.headings || cache.headings.length === 0) {
			return null;
		}

		const editor = this.plugin.app.workspace.activeEditor?.editor;
		if (!editor) {
			return null;
		}

		const cursorLine = editor.getCursor().line;
		let best: HeadingCache | null = null;
		for (const h of cache.headings) {
			if (h.position.start.line <= cursorLine) {
				best = h;
			}
		}

		return best?.heading ?? null;
	}
}
