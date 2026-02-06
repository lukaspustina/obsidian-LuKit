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

	onOpen(): void {
		super.onOpen();
		const firstHeading = this.headings[1];
		if (firstHeading) {
			this.inputEl.value = firstHeading;
			this.inputEl.dispatchEvent(new Event("input"));
			this.inputEl.select();
		}
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
