import { TFile } from "obsidian";
import type { App } from "obsidian";
import { SECTION_NOTE_TAGS, frontmatterTagsInclude } from "./frontmatter";

// app.commands ist nicht Teil des öffentlichen obsidian.d.ts — einzelner Cast
// an der Boundary (gleiches Muster wie app.plugins in der TaskNotes-Bridge).
interface CommandsApp {
	commands: { executeCommandById(id: string): boolean };
}

// Führt das konfigurierte Anlegen-Kommando aus (z. B. eine QuickAdd-Choice)
// und wartet, bis die dabei erstellte Notiz als Zielnotiz indexiert ist
// (Frontmatter-Tag via metadataCache). Liefert null, wenn das Kommando fehlt,
// der Nutzer abbricht (Timeout) oder keine Notiz entsteht; nach Timeout wird
// eine ggf. erstellte, aber noch nicht indexierte Notiz zurückgegeben —
// der Picker ignoriert Nicht-Kandidaten beim Pinnen ohnehin.
export function createSectionNoteViaCommand(app: App, commandId: string, timeoutMs = 120_000): Promise<TFile | null> {
	return new Promise((resolve) => {
		let created: TFile | null = null;
		let settled = false;
		const done = (result: TFile | null): void => {
			if (settled) return;
			settled = true;
			app.vault.offref(createRef);
			app.metadataCache.offref(changedRef);
			clearTimeout(timer);
			resolve(result);
		};
		const createRef = app.vault.on("create", (file) => {
			if (file instanceof TFile && file.extension === "md") created = file;
		});
		const changedRef = app.metadataCache.on("changed", (file) => {
			if (created === null || file.path !== created.path) return;
			const tags = app.metadataCache.getFileCache(file)?.frontmatter?.tags;
			if (frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)) done(file);
		});
		const timer = setTimeout(() => done(created), timeoutMs);
		const ok = (app as unknown as CommandsApp).commands.executeCommandById(commandId);
		if (!ok) done(null);
	});
}
