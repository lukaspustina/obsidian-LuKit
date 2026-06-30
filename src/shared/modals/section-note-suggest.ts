import { App, FuzzySuggestModal, TFile } from "obsidian";
import { frontmatterTagsInclude } from "../frontmatter";

const SKIP_LABEL = "↪ Skip this Besprechung";
const DROP_LABEL = "✕ Don't file (just remove pending tag)";
const OPEN_LABEL = "→ Stop and open this Besprechung in a new tab";
const SKIP_SENTINEL: unique symbol = Symbol("skip");
const DROP_SENTINEL: unique symbol = Symbol("drop");
const OPEN_SENTINEL: unique symbol = Symbol("open");

// A suggested note pinned above the full list. Wraps the TFile so getItemText
// can decorate it without affecting the same file's plain row.
interface PinnedItem {
	__pinned: true;
	file: TFile;
}
type Item = TFile | PinnedItem | typeof SKIP_SENTINEL | typeof DROP_SENTINEL | typeof OPEN_SENTINEL;

function isPinned(item: Item): item is PinnedItem {
	return typeof item === "object" && item !== null && "__pinned" in item;
}

export interface SectionNoteSuggestOptions {
	placeholder: string;
	onPick: (file: TFile) => void;
	// Each virtual entry is shown only when its callback is provided; absent
	// callbacks suppress the corresponding picker row.
	onSkip?: () => void;
	onDrop?: () => void;
	onOpenSource?: () => void;
	onCancel?: () => void;
	// Ordered list of suggested note basenames pinned above the sentinels and
	// the full list. Basenames that do not resolve to a current candidate file
	// are ignored. Absent or empty leaves the list unchanged.
	suggestions?: string[];
	// Optional label overrides for the virtual entries; each defaults to the
	// module's hardcoded string when absent. Lets callers (e.g. email filing)
	// relabel "Skip"/"Don't file"/"Stop and open" for their domain.
	skipLabel?: string;
	dropLabel?: string;
	openLabel?: string;
	// When set, a read-only scrollable panel with this text is shown above the
	// search field (e.g. an email preview to read before picking a target).
	previewText?: string;
}

export class SectionNoteSuggestModal extends FuzzySuggestModal<Item> {
	private sectionTags: ReadonlySet<string>;
	private options: SectionNoteSuggestOptions;
	private chosen = false;
	private previewPanel: HTMLElement | null = null;

	constructor(app: App, sectionTags: ReadonlySet<string>, options: SectionNoteSuggestOptions) {
		super(app);
		this.sectionTags = sectionTags;
		this.options = options;
		this.setPlaceholder(options.placeholder);
	}

	onOpen(): void {
		super.onOpen();
		this.renderPreviewPanel();
		this.registerActionKeys();
		this.renderInstructions();
	}

	private renderPreviewPanel(): void {
		const text = this.options.previewText;
		if (!text || !this.modalEl) return;
		const panel = this.modalEl.createDiv({ cls: "lukit-email-peek" });
		panel.setText(text);
		// flex-shrink:0 keeps the picker's suggestion list from collapsing the
		// panel; the list below scrolls instead.
		panel.style.flex = "0 0 auto";
		panel.style.maxHeight = "45vh";
		panel.style.overflowY = "auto";
		panel.style.whiteSpace = "pre-wrap";
		panel.style.padding = "10px 14px";
		panel.style.marginBottom = "6px";
		panel.style.borderBottom = "1px solid var(--background-modifier-border)";
		panel.style.fontSize = "var(--font-ui-smaller)";
		panel.style.userSelect = "text";
		this.modalEl.prepend(panel);
		this.previewPanel = panel;
	}

	// Keyboard shortcuts (⌘ = Mod). Enter (built in) files into the highlighted
	// note; Esc / click-outside skips (see onClose). These add fast paths for the
	// virtual actions without scrolling to their list entries.
	private registerActionKeys(): void {
		this.scope.register(["Mod"], ".", () => {
			this.act(this.options.onCancel); // ⌘. → Stop
			return false;
		});
		if (this.options.onDrop) {
			this.scope.register(["Mod"], "D", () => {
				this.act(this.options.onDrop); // ⌘D → Don't file
				return false;
			});
		}
		if (this.previewPanel) {
			this.scope.register(["Mod"], "P", () => {
				const panel = this.previewPanel; // ⌘P → toggle the email peek
				if (panel) panel.style.display = panel.style.display === "none" ? "" : "none";
				return false;
			});
		}
	}

	private renderInstructions(): void {
		const instructions: { command: string; purpose: string }[] = [
			{ command: "↵", purpose: "Ablegen" },
		];
		if (this.options.onSkip) instructions.push({ command: "esc", purpose: "Überspringen" });
		if (this.options.onDrop) instructions.push({ command: "⌘D", purpose: "Nur archivieren" });
		if (this.options.onCancel) instructions.push({ command: "⌘.", purpose: "Stopp" });
		if (this.previewPanel) instructions.push({ command: "⌘P", purpose: "Vorschau ein/aus" });
		this.setInstructions(instructions);
	}

	// Marks the modal as acted-on (so onClose won't treat it as a dismiss), closes
	// it, then runs the action.
	private act(fn?: () => void): void {
		this.chosen = true;
		this.close();
		fn?.();
	}

	getItems(): Item[] {
		const matches = this.app.vault
			.getMarkdownFiles()
			.filter((f) => {
				const tags = this.app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				return frontmatterTagsInclude(tags, this.sectionTags);
			})
			.sort((a, b) => b.stat.mtime - a.stat.mtime);

		const pinnedFiles: TFile[] = [];
		const pinnedPaths = new Set<string>();
		for (const basename of this.options.suggestions ?? []) {
			const file = matches.find((m) => m.basename === basename);
			if (file && !pinnedPaths.has(file.path)) {
				pinnedFiles.push(file);
				pinnedPaths.add(file.path);
			}
		}
		const pinnedItems: Item[] = pinnedFiles.map((file) => ({ __pinned: true, file }));
		const rest = matches.filter((m) => !pinnedPaths.has(m.path));

		const sentinels: Item[] = [];
		if (this.options.onSkip) sentinels.push(SKIP_SENTINEL);
		if (this.options.onDrop) sentinels.push(DROP_SENTINEL);
		if (this.options.onOpenSource) sentinels.push(OPEN_SENTINEL);
		return [...pinnedItems, ...sentinels, ...rest];
	}

	getItemText(item: Item): string {
		if (item === SKIP_SENTINEL) return this.options.skipLabel ?? SKIP_LABEL;
		if (item === DROP_SENTINEL) return this.options.dropLabel ?? DROP_LABEL;
		if (item === OPEN_SENTINEL) return this.options.openLabel ?? OPEN_LABEL;
		if (isPinned(item)) return `★ ${item.file.basename} (suggested)`;
		return item.basename;
	}

	onChooseItem(item: Item): void {
		this.chosen = true;
		if (item === SKIP_SENTINEL) this.options.onSkip?.();
		else if (item === DROP_SENTINEL) this.options.onDrop?.();
		else if (item === OPEN_SENTINEL) this.options.onOpenSource?.();
		else if (isPinned(item)) this.options.onPick(item.file);
		else this.options.onPick(item);
	}

	onClose(): void {
		super.onClose();
		// Some Obsidian builds call onClose() BEFORE onChooseItem() on a
		// selection, so `chosen` isn't set yet at this point. Defer the decision
		// a tick so it reflects whether an item was actually chosen, regardless of
		// the close/choose order. A genuine dismiss (Esc / click-outside) means
		// "skip this one" when skipping is available, else cancel.
		setTimeout(() => {
			if (this.chosen) return;
			if (this.options.onSkip) this.options.onSkip();
			else this.options.onCancel?.();
		}, 0);
	}
}
