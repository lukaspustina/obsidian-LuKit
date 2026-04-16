import { Notice, TFile } from "obsidian";
import type LuKitPlugin from "../../main";
import { LUKIT_ICON_ID } from "../../types";
import type { LuKitFeature } from "../../types";
import { formatBesprechungSummary, extractCreatedDate } from "./besprechung-engine";
import { renderBesprechungSettings } from "./besprechung-settings";
import { FolderNoteSuggestModal } from "../../shared/modals/folder-note-suggest";
import { addVorgangSectionLinked } from "../vorgang/vorgang-engine";
import { extractDateFromTitle } from "../../shared/date-format";

export class BesprechungFeature implements LuKitFeature {
	id = "besprechung";
	private plugin!: LuKitPlugin;

	onload(plugin: LuKitPlugin): void {
		this.plugin = plugin;

		plugin.addCommand({
			id: "besprechung-add-summary",
			name: "Besprechung: Add summary",
			icon: LUKIT_ICON_ID,
			editorCallback: (editor) => {
				this.addBesprechungSummaryCmd(editor);
			},
		});
	}

	onunload(): void {
		// Nothing to clean up
	}

	renderSettings(containerEl: HTMLElement, plugin: LuKitPlugin): void {
		renderBesprechungSettings(containerEl, plugin);
	}

	private addBesprechungSummaryCmd(editor: import("obsidian").Editor): void {
		const folderPath = this.plugin.settings.besprechung.folderPath;
		if (!folderPath) {
			new Notice("LuKit: No Besprechung folder configured. Set it in Settings → LuKit.");
			return;
		}

		const headings = this.plugin.settings.besprechung.sectionHeadings;

		new FolderNoteSuggestModal(this.plugin.app, folderPath, "Pick a Besprechung…", async (besprechungFile) => {
			let besprechungContent: string;
			try {
				besprechungContent = await this.plugin.app.vault.read(besprechungFile);
			} catch (e) {
				new Notice("LuKit: Could not read besprechung file: " + (e instanceof Error ? e.message : String(e)));
				return;
			}
			const summary = formatBesprechungSummary(besprechungContent, headings);

			if (!summary) {
				const names = headings.join(" or ");
				new Notice(`LuKit: No ${names} found.`);
				return;
			}

			const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
			if (!activeEditor) {
				new Notice("LuKit: No active editor.");
				return;
			}

			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (activeFile && this.isSectionNote(activeFile)) {
				const locale = this.plugin.settings.dateLocale;
				const date = extractDateFromTitle(activeFile.basename, locale)
					?? extractCreatedDate(besprechungContent)
					?? new Date();
				const vorgangContent = activeEditor.getValue();
				const { newContent, cursorLineIndex } = addVorgangSectionLinked(
					vorgangContent,
					besprechungFile.basename,
					locale,
					date,
					summary.split("\n"),
				);
				activeEditor.setValue(newContent);
				const pos = { line: cursorLineIndex, ch: 0 };
				activeEditor.setCursor(pos);
				activeEditor.scrollIntoView({ from: pos, to: pos }, true);
			} else {
				const cursor = activeEditor.getCursor();
				activeEditor.replaceRange(summary, cursor);
			}
		}).open();
	}

	private static readonly SECTION_NOTE_TAGS = ["Vorgang", "Person", "Bestellung", "Bewerbung"];

	private isSectionNote(file: TFile): boolean {
		const cache = this.plugin.app.metadataCache.getFileCache(file);
		const tags = cache?.frontmatter?.tags;
		if (typeof tags === "string") return BesprechungFeature.SECTION_NOTE_TAGS.includes(tags);
		if (Array.isArray(tags)) return (tags as string[]).some(t => BesprechungFeature.SECTION_NOTE_TAGS.includes(t));
		return false;
	}
}
