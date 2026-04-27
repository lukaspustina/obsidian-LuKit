import { App, FuzzySuggestModal, TFile, normalizePath } from "obsidian";

export class FolderNoteSuggestModal extends FuzzySuggestModal<TFile> {
	private folderPath: string;
	private onChoose: (file: TFile) => void;
	private excludePaths: ReadonlySet<string>;
	private initialQuery: string;

	constructor(
		app: App,
		folderPath: string,
		placeholder: string,
		onChoose: (file: TFile) => void,
		excludePaths: ReadonlySet<string> = new Set(),
		initialQuery: string = "",
	) {
		super(app);
		this.folderPath = normalizePath(folderPath);
		this.onChoose = onChoose;
		this.excludePaths = excludePaths;
		this.initialQuery = initialQuery;
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		super.onOpen();
		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.inputEl.dispatchEvent(new Event("input"));
		}
	}

	getItems(): TFile[] {
		const prefix = this.folderPath + "/";
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(prefix) && !this.excludePaths.has(f.path))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
