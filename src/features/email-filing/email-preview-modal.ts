import { App, Modal } from "obsidian";

// One message row in the preview: a read-only header (date · party · direction),
// an editable body, and an optional read-only attachment line. Headers and
// attachment lines are re-emitted verbatim on commit so the message:// links
// (used by dedup and recovery) can never be broken by editing.
export interface PreviewMessage {
	header: string;
	body: string;
	attachmentsLine: string | null;
}

// Per-message result: whether to include the message in the written section and
// its (possibly edited) body. Same index order as the input messages.
export interface PreviewMessageResult {
	included: boolean;
	body: string;
}

// Shows an assembled thread as one row per message — each with an include/exclude
// checkbox and an editable body textarea; the header + attachment line are
// read-only. onConfirm receives per-message results (order preserved); onCancel
// fires when cancelled or closed without confirming.
export class EmailPreviewModal extends Modal {
	private readonly targetNoteName: string;
	private readonly subtitle: string;
	private readonly messages: PreviewMessage[];
	private readonly onConfirm: (results: PreviewMessageResult[]) => void;
	private readonly onCancelCb: () => void;
	private confirmed = false;

	constructor(
		app: App,
		targetNoteName: string,
		subtitle: string,
		messages: PreviewMessage[],
		onConfirm: (results: PreviewMessageResult[]) => void,
		onCancel: () => void,
	) {
		super(app);
		this.targetNoteName = targetNoteName;
		this.subtitle = subtitle;
		this.messages = messages;
		this.onConfirm = onConfirm;
		this.onCancelCb = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: `E-Mail ablegen → ${this.targetNoteName}` });
		contentEl.createEl("p", { text: this.subtitle });

		const checkboxes: HTMLInputElement[] = [];
		const textareas: HTMLTextAreaElement[] = [];

		for (const msg of this.messages) {
			const row = contentEl.createEl("div", { cls: "lukit-email-preview-msg" });
			const headerRow = row.createEl("label", { cls: "lukit-email-preview-header" });
			const checkbox = headerRow.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = true;
			headerRow.createEl("span", { text: ` ${msg.header}` });
			checkboxes.push(checkbox);

			const textarea = row.createEl("textarea", { cls: "lukit-email-preview" });
			textarea.value = msg.body;
			textarea.rows = 6;
			textarea.style.width = "100%";
			textareas.push(textarea);

			if (msg.attachmentsLine) {
				row.createEl("p", { cls: "lukit-email-preview-atts", text: msg.attachmentsLine });
			}

			// Excluding a message dims and disables its body editor.
			checkbox.addEventListener("change", () => {
				textarea.disabled = !checkbox.checked;
			});
		}

		const buttons = contentEl.createEl("div", { cls: "lukit-email-preview-buttons" });
		const confirmBtn = buttons.createEl("button", { text: "Ablegen" });
		confirmBtn.addEventListener("click", () => {
			this.confirmed = true;
			this.onConfirm(
				this.messages.map((_, i) => ({
					included: checkboxes[i].checked,
					body: textareas[i].value,
				})),
			);
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
