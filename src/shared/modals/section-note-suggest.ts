import { App, FuzzySuggestModal, TFile } from "obsidian";
import { frontmatterTagsInclude } from "../frontmatter";

const SKIP_LABEL = "↪ Skip this Besprechung";
const DROP_LABEL = "✕ Don't file (just remove pending tag)";
const OPEN_LABEL = "→ Stop and open this Besprechung in a new tab";
const SKIP_SENTINEL: unique symbol = Symbol("skip");
const DROP_SENTINEL: unique symbol = Symbol("drop");
const OPEN_SENTINEL: unique symbol = Symbol("open");
type Item = TFile | typeof SKIP_SENTINEL | typeof DROP_SENTINEL | typeof OPEN_SENTINEL;

export interface SectionNoteSuggestOptions {
	placeholder: string;
	onPick: (file: TFile) => void;
	// Each virtual entry is shown only when its callback is provided; absent
	// callbacks suppress the corresponding picker row.
	onSkip?: () => void;
	onDrop?: () => void;
	onOpenSource?: () => void;
	onCancel?: () => void;
}

export class SectionNoteSuggestModal extends FuzzySuggestModal<Item> {
	private sectionTags: ReadonlySet<string>;
	private options: SectionNoteSuggestOptions;
	private chosen = false;

	constructor(app: App, sectionTags: ReadonlySet<string>, options: SectionNoteSuggestOptions) {
		super(app);
		this.sectionTags = sectionTags;
		this.options = options;
		this.setPlaceholder(options.placeholder);
	}

	getItems(): Item[] {
		const matches = this.app.vault
			.getMarkdownFiles()
			.filter((f) => {
				const tags = this.app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				return frontmatterTagsInclude(tags, this.sectionTags);
			})
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		const sentinels: Item[] = [];
		if (this.options.onSkip) sentinels.push(SKIP_SENTINEL);
		if (this.options.onDrop) sentinels.push(DROP_SENTINEL);
		if (this.options.onOpenSource) sentinels.push(OPEN_SENTINEL);
		return [...sentinels, ...matches];
	}

	getItemText(item: Item): string {
		if (item === SKIP_SENTINEL) return SKIP_LABEL;
		if (item === DROP_SENTINEL) return DROP_LABEL;
		if (item === OPEN_SENTINEL) return OPEN_LABEL;
		return item.basename;
	}

	onChooseItem(item: Item): void {
		this.chosen = true;
		if (item === SKIP_SENTINEL) this.options.onSkip?.();
		else if (item === DROP_SENTINEL) this.options.onDrop?.();
		else if (item === OPEN_SENTINEL) this.options.onOpenSource?.();
		else this.options.onPick(item);
	}

	onClose(): void {
		super.onClose();
		if (!this.chosen) this.options.onCancel?.();
	}
}
