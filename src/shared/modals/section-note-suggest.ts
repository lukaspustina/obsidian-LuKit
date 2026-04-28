import { App, FuzzySuggestModal, TFile } from "obsidian";
import { frontmatterTagsInclude } from "../../features/besprechung/besprechung-engine";

const SKIP_LABEL = "↪ Skip this Besprechung";
const DROP_LABEL = "✕ Don't file (just remove pending tag)";
const OPEN_LABEL = "→ Stop and open this Besprechung in a new tab";
const SKIP_SENTINEL: unique symbol = Symbol("skip");
const DROP_SENTINEL: unique symbol = Symbol("drop");
const OPEN_SENTINEL: unique symbol = Symbol("open");
type Item = TFile | typeof SKIP_SENTINEL | typeof DROP_SENTINEL | typeof OPEN_SENTINEL;

export class SectionNoteSuggestModal extends FuzzySuggestModal<Item> {
	private sectionTags: ReadonlySet<string>;
	private onPick: (file: TFile) => void;
	private onSkip: () => void;
	private onDrop: () => void;
	private onOpenSource: () => void;
	private onCancel?: () => void;
	private chosen = false;

	constructor(
		app: App,
		sectionTags: ReadonlySet<string>,
		placeholder: string,
		onPick: (file: TFile) => void,
		onSkip: () => void,
		onDrop: () => void,
		onOpenSource: () => void,
		onCancel?: () => void,
	) {
		super(app);
		this.sectionTags = sectionTags;
		this.onPick = onPick;
		this.onSkip = onSkip;
		this.onDrop = onDrop;
		this.onOpenSource = onOpenSource;
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
		return [SKIP_SENTINEL, DROP_SENTINEL, OPEN_SENTINEL, ...matches];
	}

	getItemText(item: Item): string {
		if (item === SKIP_SENTINEL) return SKIP_LABEL;
		if (item === DROP_SENTINEL) return DROP_LABEL;
		if (item === OPEN_SENTINEL) return OPEN_LABEL;
		return item.basename;
	}

	onChooseItem(item: Item): void {
		this.chosen = true;
		if (item === SKIP_SENTINEL) this.onSkip();
		else if (item === DROP_SENTINEL) this.onDrop();
		else if (item === OPEN_SENTINEL) this.onOpenSource();
		else this.onPick(item);
	}

	onClose(): void {
		super.onClose();
		if (!this.chosen) this.onCancel?.();
	}
}
