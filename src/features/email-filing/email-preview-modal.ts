import { App, Modal } from "obsidian";

// Pre-fills assembled text (a single email body, or a whole thread section) in
// an editable textarea with a read-only heading + subtitle. Calls onConfirm with
// the (possibly edited) text on confirm, onCancel when cancelled or closed
// without confirming.
export class EmailPreviewModal extends Modal {
	private readonly targetNoteName: string;
	private readonly subtitle: string;
	private readonly body: string;
	private readonly onConfirm: (editedBody: string) => void;
	private readonly onCancelCb: () => void;
	private confirmed = false;

	constructor(
		app: App,
		targetNoteName: string,
		subtitle: string,
		body: string,
		onConfirm: (editedBody: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.targetNoteName = targetNoteName;
		this.subtitle = subtitle;
		this.body = body;
		this.onConfirm = onConfirm;
		this.onCancelCb = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `E-Mail ablegen → ${this.targetNoteName}` });
		contentEl.createEl("p", { text: this.subtitle });

		const textarea = contentEl.createEl("textarea", { cls: "lukit-email-preview" });
		textarea.value = this.body;
		textarea.rows = 20;
		textarea.style.width = "100%";

		const buttons = contentEl.createEl("div", { cls: "lukit-email-preview-buttons" });
		const confirmBtn = buttons.createEl("button", { text: "Ablegen" });
		confirmBtn.addEventListener("click", () => {
			this.confirmed = true;
			this.onConfirm(textarea.value);
			this.close();
		});
		const cancelBtn = buttons.createEl("button", { text: "Abbrechen" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) {
			this.onCancelCb();
		}
	}
}
