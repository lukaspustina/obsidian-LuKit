import { App, Modal } from "obsidian";

interface HelpCommand {
	name: string;
	description: string;
}

interface HelpSection {
	title: string;
	setup?: string;
	commands: HelpCommand[];
}

const HELP_SECTIONS: HelpSection[] = [
	{
		title: "Work Diary",
		setup: "Set the diary note path in Settings > LuKit.",
		commands: [
			{
				name: "Diary: Ensure today's header",
				description:
					"Creates today's date header if missing, opens the diary note and positions the cursor below it.",
			},
			{
				name: "Diary: Add linked entry",
				description:
					"Pick a note and heading via fuzzy search, inserts a linked entry under today's header.",
			},
			{
				name: "Diary: Add text entry",
				description:
					"Type free text, inserts it as a bullet under today's header.",
			},
			{
				name: "Diary: Add reminder",
				description:
					"Type a quick thought, inserts it under a # Erinnerungen section between frontmatter and the diary separator. Newest first, tagged with today's date.",
			},
			{
				name: "Diary: Add current note",
				description:
					"Adds the active note (with the heading at cursor) as a linked diary entry under today's header. No modals — one-step command.",
			},
		],
	},
	{
		title: "Vorgang",
		commands: [
			{
				name: "Vorgang: Add section",
				description:
					"Prompts for a section name, inserts a TOC bullet under # Inhalt and an h5 header section, then places the cursor on a blank bullet. Also creates a linked diary entry if a diary path is configured.",
			},
		],
	},
	{
		title: "Besprechung",
		setup:
			"Set the Besprechung folder path and section headings in Settings > LuKit.",
		commands: [
			{
				name: "Besprechung: Add summary",
				description:
					"Pick a meeting note from the configured folder, extract key sections, and insert at the cursor position.",
			},
		],
	},
	{
		title: "Migration",
		commands: [
			{
				name: "Migration: Convert note",
				description:
					"Converts the active note from old bold-header format to h5 headers and wikilink TOC entries. Shows a confirmation dialog first.",
			},
		],
	},
];

export class HelpModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lukit-help-modal");

		contentEl.createEl("h2", { text: "LuKit \u2014 Commands" });

		for (const section of HELP_SECTIONS) {
			contentEl.createEl("h3", { text: section.title });

			if (section.setup) {
				const setupEl = contentEl.createEl("p", {
					cls: "lukit-help-setup",
				});
				setupEl.createEl("strong", { text: "Setup: " });
				setupEl.appendText(section.setup);
			}

			const list = contentEl.createEl("ul", { cls: "lukit-help-list" });
			for (const cmd of section.commands) {
				const li = list.createEl("li");
				li.createEl("strong", { text: cmd.name });
				li.appendText(" \u2014 " + cmd.description);
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
