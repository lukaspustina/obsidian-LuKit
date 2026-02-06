import { App, FuzzySuggestModal, TFile } from "obsidian";

export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Pick a note…");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
