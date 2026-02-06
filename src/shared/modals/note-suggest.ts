import { App, FuzzySuggestModal, TFile } from "obsidian";

export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Pick a note…");
	}

	onOpen(): void {
		super.onOpen();
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			this.inputEl.value = activeFile.basename;
			this.inputEl.dispatchEvent(new Event("input"));
			this.inputEl.select();
		}
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
