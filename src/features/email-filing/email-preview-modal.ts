import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import { formatAttachmentSize } from "./email-format-engine";

// One message row in the preview: a read-only header (date · party · direction),
// an editable body, and a list of attachments with a checkbox each (name
// read-only). Headers and attachment names are re-emitted verbatim on commit
// so the message:// links (used by dedup and recovery) can never be broken by
// editing.
export interface PreviewMessage {
	header: string;
	body: string;
	// size is the attachment's byte count for display only; absent or -1 means
	// the bridge could not determine it and the row stays name-only.
	attachments: { name: string; preselected: boolean; size?: number }[];
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

// Aktueller Stand der Zielnotiz für die Seitenspalte: `preview` ist der bereits
// getrimmte Markdown, `path` der Render-Kontext für MarkdownRenderer.render.
export interface PreviewTarget {
	preview: string;
	path: string;
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
	private readonly onConfirm: (
		results: PreviewMessageResult[],
		outcome: PreviewOutcome,
		nextSteps: string[] | null,
	) => void;
	private readonly onCancelCb: () => void;
	// Absent when the target note could not be read — the body then renders as a
	// single column, exactly as before the side panel existed.
	private readonly target?: PreviewTarget;
	private readonly targetComponent = new Component();
	private confirmed = false;
	// ⌘K: write the intake group even without items. It does not outrank typed
	// text — on a filled field the press changes nothing.
	private nextStepsPlaceholder = false;

	constructor(
		app: App,
		targetNoteName: string,
		subtitle: string,
		sectionName: string,
		messages: PreviewMessage[],
		onConfirm: (results: PreviewMessageResult[], outcome: PreviewOutcome, nextSteps: string[] | null) => void,
		onCancel: () => void,
		target?: PreviewTarget,
	) {
		super(app);
		this.targetNoteName = targetNoteName;
		this.subtitle = subtitle;
		this.sectionName = sectionName;
		this.messages = messages;
		this.onConfirm = onConfirm;
		this.onCancelCb = onCancel;
		this.target = target;
	}

	// The ⌘K handler, also a directly-callable hook: Modal.scope.register is inert
	// in the test harness, so the binding is pinned through this method (the same
	// reason TaskTriageModal pins availableActions).
	private triggerNextStepsPlaceholder(): void {
		this.nextStepsPlaceholder = true;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.nextStepsPlaceholder = false;
		this.targetComponent.load();
		// Width scales with the main window; the height follows the thread up to a
		// cap (see styles.css), and the message list scrolls when it exceeds it.
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

		// The body is the modal's only growing region; the footer below stays put
		// so the buttons never scroll out of reach. Two columns when the target
		// note could be read, one when it could not.
		const bodyEl = contentEl.createEl("div", {
			cls: this.target ? ["lukit-email-preview-body"] : ["lukit-email-preview-body", "is-single"],
		});
		const messageList = bodyEl.createEl("div", { cls: "lukit-email-preview-messages" });

		for (const msg of this.messages) {
			const row = messageList.createEl("div", { cls: "lukit-email-preview-msg" });
			const headerRow = row.createEl("label", { cls: "lukit-email-preview-header" });
			const checkbox = headerRow.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = true;
			headerRow.createEl("span", { text: ` ${msg.header}` });
			checkboxes.push(checkbox);

			const textarea = row.createEl("textarea", { cls: "lukit-email-preview" });
			textarea.value = msg.body;
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
					const size = formatAttachmentSize(att.size);
					if (size !== "") attRow.createEl("span", { text: ` · ${size}`, cls: "lukit-email-preview-attachment-size" });
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

		if (this.target) {
			const targetEl = bodyEl.createEl("div", { cls: "lukit-email-preview-target" });
			targetEl.createEl("div", { text: "Zielnotiz (⌘P)", cls: "lukit-email-preview-target-label" });
			const targetBody = targetEl.createEl("div");
			void MarkdownRenderer.render(this.app, this.target.preview, targetBody, this.target.path, this.targetComponent);
			this.scope.register(["Mod"], "p", (evt) => {
				evt.preventDefault();
				bodyEl.classList.toggle("is-single");
				return false;
			});
		}

		// Next steps: one line per item, empty by default. Indentation is kept —
		// buildIntakeGroup reads it as an item's continuation lines.
		const footer = contentEl.createEl("div", { cls: "lukit-email-preview-footer" });
		const nextStepsRow = footer.createEl("label", { cls: "lukit-email-preview-next-steps-row" });
		nextStepsRow.createEl("span", { text: "Nächste Schritte (eine Zeile je Punkt, ⌘K = Gruppe ohne Punkte): " });
		const nextStepsInput = nextStepsRow.createEl("textarea", { cls: "lukit-email-preview-next-steps" });
		nextStepsInput.value = "";

		const submit = (openAfterFiling: boolean): void => {
			this.confirmed = true;
			const typed = nextStepsInput.value.split("\n").filter((l) => l.trim() !== "");
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
				typed.length > 0 ? typed : this.nextStepsPlaceholder ? [] : null,
			);
			this.close();
		};

		const buttons = footer.createEl("div", { cls: "lukit-email-preview-buttons" });
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
		this.scope.register(["Mod"], "k", (evt) => {
			evt.preventDefault();
			this.triggerNextStepsPlaceholder();
			return false;
		});
	}

	onClose(): void {
		this.targetComponent.unload();
		this.contentEl.empty();
		if (!this.confirmed) {
			this.onCancelCb();
		}
	}
}
