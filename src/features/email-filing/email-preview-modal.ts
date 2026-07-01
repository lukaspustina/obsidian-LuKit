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
		// Size the modal to a fraction of the main window (scales with it, not a
		// fixed size); the content area scrolls when the thread is long.
		this.modalEl.addClass("lukit-email-preview-modal");
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

		const submit = (): void => {
			this.confirmed = true;
			this.onConfirm(
				this.messages.map((_, i) => ({
					included: checkboxes[i].checked,
					body: textareas[i].value,
				})),
			);
			this.close();
		};

		const buttons = contentEl.createEl("div", { cls: "lukit-email-preview-buttons" });
		const confirmBtn = buttons.createEl("button", { text: "Ablegen", cls: "mod-cta" });
		confirmBtn.addEventListener("click", submit);
		const cancelBtn = buttons.createEl("button", { text: "Abbrechen" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		// Enter files the thread — but not while editing a body (there it inserts a
		// newline). ⌘/Ctrl+Enter files from anywhere, including a body.
		this.scope.register([], "Enter", (evt) => {
			const active = this.contentEl.ownerDocument.activeElement;
			if (active instanceof HTMLTextAreaElement) return true;
			evt.preventDefault();
			submit();
			return false;
		});
		this.scope.register(["Mod"], "Enter", (evt) => {
			evt.preventDefault();
			submit();
			return false;
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) {
			this.onCancelCb();
		}
	}
}
