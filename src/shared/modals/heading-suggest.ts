import { App, FuzzySuggestModal, TFile } from "obsidian";

const NO_HEADING = "No heading";

export class HeadingSuggestModal extends FuzzySuggestModal<string> {
	private onChoose: (heading: string | null) => void;
	private headings: string[];

	constructor(app: App, file: TFile, onChoose: (heading: string | null) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Pick a heading…");

		const cache = this.app.metadataCache.getFileCache(file);
		const fileHeadings = cache?.headings?.map((h) => h.heading) ?? [];
		this.headings = [NO_HEADING, ...fileHeadings];
	}

	getItems(): string[] {
		return this.headings;
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string): void {
		this.onChoose(item === NO_HEADING ? null : item);
	}
}
