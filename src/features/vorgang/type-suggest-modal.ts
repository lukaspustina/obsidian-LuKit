import { App, FuzzySuggestModal } from "obsidian";
import { SECTION_NOTE_TAGS } from "../../shared/frontmatter";

// Wählt den Zielnotiz-Typ (Frontmatter-Tag) fürs Umwandeln einer Notiz.
export class TypeSuggestModal extends FuzzySuggestModal<string> {
	private onPick: (tag: string) => void;

	constructor(app: App, onPick: (tag: string) => void) {
		super(app);
		this.onPick = onPick;
		this.setPlaceholder("Typ wählen…");
	}

	getItems(): string[] {
		return [...SECTION_NOTE_TAGS];
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string): void {
		this.onPick(item);
	}
}
