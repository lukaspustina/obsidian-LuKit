import { App, FuzzySuggestModal, TFile, normalizePath } from "obsidian";

export class FolderNoteSuggestModal extends FuzzySuggestModal<TFile> {
	private folderPath: string;
	private onChoose: (file: TFile) => void;

	constructor(app: App, folderPath: string, placeholder: string, onChoose: (file: TFile) => void) {
		super(app);
		this.folderPath = normalizePath(folderPath);
		this.onChoose = onChoose;
		this.setPlaceholder(placeholder);
	}

	getItems(): TFile[] {
		const prefix = this.folderPath + "/";
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(prefix))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
