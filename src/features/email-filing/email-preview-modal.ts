import { App, Modal } from "obsidian";
import type { EmailMeta } from "./email-format-engine";

// Pre-fills the extracted email body in an editable textarea with read-only
// header fields. Calls onConfirm with the (possibly edited) body on confirm,
// onCancel when cancelled or closed without confirming.
export class EmailPreviewModal extends Modal {
	private readonly meta: EmailMeta;
	private readonly body: string;
	private readonly targetNoteName: string;
	private readonly onConfirm: (editedBody: string) => void;
	private readonly onCancelCb: () => void;
	private confirmed = false;

	constructor(
		app: App,
		meta: EmailMeta,
		body: string,
		targetNoteName: string,
		onConfirm: (editedBody: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.meta = meta;
		this.body = body;
		this.targetNoteName = targetNoteName;
		this.onConfirm = onConfirm;
		this.onCancelCb = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `E-Mail ablegen → ${this.targetNoteName}` });
		contentEl.createEl("p", { text: `Von: ${this.meta.senderName}` });
		contentEl.createEl("p", { text: `Betreff: ${this.meta.subject}` });

		const textarea = contentEl.createEl("textarea", { cls: "lukit-email-preview" });
		textarea.value = this.body;
		textarea.rows = 14;
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
