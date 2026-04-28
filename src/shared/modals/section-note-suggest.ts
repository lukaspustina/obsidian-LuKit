import { App, FuzzySuggestModal, TFile } from "obsidian";
import { frontmatterTagsInclude } from "../../features/besprechung/besprechung-engine";

const SKIP_LABEL = "↪ Skip this Besprechung";
const SKIP_SENTINEL: unique symbol = Symbol("skip");
type Item = TFile | typeof SKIP_SENTINEL;

export class SectionNoteSuggestModal extends FuzzySuggestModal<Item> {
	private sectionTags: ReadonlySet<string>;
	private onPick: (file: TFile) => void;
	private onSkip: () => void;
	private onCancel?: () => void;
	private chosen = false;

	constructor(
		app: App,
		sectionTags: ReadonlySet<string>,
		placeholder: string,
		onPick: (file: TFile) => void,
		onSkip: () => void,
		onCancel?: () => void,
	) {
		super(app);
		this.sectionTags = sectionTags;
		this.onPick = onPick;
		this.onSkip = onSkip;
		this.onCancel = onCancel;
		this.setPlaceholder(placeholder);
	}

	getItems(): Item[] {
		const matches = this.app.vault
			.getMarkdownFiles()
			.filter((f) => {
				const tags = this.app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				return frontmatterTagsInclude(tags, this.sectionTags);
			})
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		return [SKIP_SENTINEL, ...matches];
	}

	getItemText(item: Item): string {
		return item === SKIP_SENTINEL ? SKIP_LABEL : item.basename;
	}

	onChooseItem(item: Item): void {
		this.chosen = true;
		if (item === SKIP_SENTINEL) this.onSkip();
		else this.onPick(item);
	}

	onClose(): void {
		super.onClose();
		if (!this.chosen) this.onCancel?.();
	}
}
