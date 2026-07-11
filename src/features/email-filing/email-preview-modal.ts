import { App, Modal } from "obsidian";

// One message row in the preview: a read-only header (date · party · direction),
// an editable body, and a list of attachments with a checkbox each (name
// read-only). Headers and attachment names are re-emitted verbatim on commit
// so the message:// links (used by dedup and recovery) can never be broken by
// editing.
export interface PreviewMessage {
	header: string;
	body: string;
	attachments: { name: string; preselected: boolean }[];
}

// Per-message result: whether to include the message in the written section,
// its (possibly edited) body, and which of its attachments (positional to
// PreviewMessage.attachments) stayed checked. Same index order as the input
// messages; attachmentsIncluded is [] for a message without attachments.
export interface PreviewMessageResult {
	included: boolean;
	body: string;
	attachmentsIncluded: boolean[];
}

// Thread-weite Bestätigung: der (ggf. editierte) Abschnittstitel und ob nach
// dem Ablegen die Zielnotiz im aktuellen Fenster geöffnet werden soll
// („Ablegen und Öffnen" — beendet im Walk den Durchlauf).
export interface PreviewOutcome {
	sectionName: string;
	openAfterFiling: boolean;
}

// Shows an assembled thread as one row per message — each with an include/exclude
// checkbox and an editable body textarea; the header + attachment line are
// read-only. onConfirm receives per-message results (order preserved); onCancel
// fires when cancelled or closed without confirming.
export class EmailPreviewModal extends Modal {
	private readonly targetNoteName: string;
	private readonly subtitle: string;
	private readonly sectionName: string;
	private readonly messages: PreviewMessage[];
	private readonly onConfirm: (results: PreviewMessageResult[], outcome: PreviewOutcome) => void;
	private readonly onCancelCb: () => void;
	private confirmed = false;

	constructor(
		app: App,
		targetNoteName: string,
		subtitle: string,
		sectionName: string,
		messages: PreviewMessage[],
		onConfirm: (results: PreviewMessageResult[], outcome: PreviewOutcome) => void,
		onCancel: () => void,
	) {
		super(app);
		this.targetNoteName = targetNoteName;
		this.subtitle = subtitle;
		this.sectionName = sectionName;
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

		// Editierbarer Abschnittstitel: der generierte Name ist der Vorschlag,
		// leerer Input fällt beim Bestätigen auf ihn zurück.
		const sectionRow = contentEl.createEl("label", { cls: "lukit-email-preview-section" });
		sectionRow.createEl("span", { text: "Abschnittstitel: " });
		const sectionInput = sectionRow.createEl("input");
		sectionInput.type = "text";
		sectionInput.value = this.sectionName;

		const checkboxes: HTMLInputElement[] = [];
		const textareas: HTMLTextAreaElement[] = [];
		const attachmentCheckboxes: HTMLInputElement[][] = [];

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

			const msgAttachmentCheckboxes: HTMLInputElement[] = [];
			attachmentCheckboxes.push(msgAttachmentCheckboxes);
			if (msg.attachments.length > 0) {
				const attsContainer = row.createEl("div", { cls: "lukit-email-preview-atts" });
				for (const att of msg.attachments) {
					const attRow = attsContainer.createEl("label", { cls: "lukit-email-preview-attachment" });
					const attCheckbox = attRow.createEl("input");
					attCheckbox.type = "checkbox";
					attCheckbox.checked = att.preselected;
					attRow.createEl("span", { text: att.name });
					msgAttachmentCheckboxes.push(attCheckbox);
				}
			}

			// Excluding a message dims and disables its body editor and its
			// attachment checkboxes (checked state untouched, so re-including it
			// restores the previous selection).
			checkbox.addEventListener("change", () => {
				textarea.disabled = !checkbox.checked;
				for (const attCheckbox of msgAttachmentCheckboxes) attCheckbox.disabled = !checkbox.checked;
			});
		}

		const submit = (openAfterFiling: boolean): void => {
			this.confirmed = true;
			this.onConfirm(
				this.messages.map((_, i) => ({
					included: checkboxes[i].checked,
					body: textareas[i].value,
					attachmentsIncluded: attachmentCheckboxes[i].map((cb) => cb.checked),
				})),
				{
					sectionName: sectionInput.value.trim() === "" ? this.sectionName : sectionInput.value.trim(),
					openAfterFiling,
				},
			);
			this.close();
		};

		const buttons = contentEl.createEl("div", { cls: "lukit-email-preview-buttons" });
		const confirmBtn = buttons.createEl("button", { text: "Ablegen", cls: "mod-cta" });
		confirmBtn.addEventListener("click", () => submit(false));
		const openBtn = buttons.createEl("button", { text: "Ablegen und Öffnen" });
		openBtn.addEventListener("click", () => submit(true));
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
			submit(false);
			return false;
		});
		this.scope.register(["Mod"], "Enter", (evt) => {
			evt.preventDefault();
			submit(false);
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
