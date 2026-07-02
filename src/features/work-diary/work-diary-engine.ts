import { extractDateFromTitle, formatDate } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import { findThirdSeparatorIndex } from "../../shared/diary";

// Re-export helpers that work-diary-feature.ts and other consumers expect
// from this module.
export {
	formatTodayHeader,
	findThirdSeparatorIndex,
	findTodayHeaderIndex,
	ensureTodayHeader,
	entryExistsUnderToday,
	addEntryUnderToday,
	stripWikilinks,
	formatDiaryEntry,
	formatTextEntry,
} from "../../shared/diary";

export function formatReminderEntry(text: string, locale: DateLocale, date?: Date): string {
	const d = date ?? new Date();
	return `- ${text}, ${formatDate(d, locale)}`;
}

function findNthSeparatorIndex(lines: string[], n: number): number {
	let count = 0;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			count++;
			if (count === n) return i;
		}
	}
	return -1;
}

function findSecondSeparatorIndex(lines: string[]): number {
	return findNthSeparatorIndex(lines, 2);
}

function findErinnerungenIndex(lines: string[], fromIndex: number, toIndex: number): number {
	for (let i = fromIndex; i < toIndex; i++) {
		if (lines[i].trim() === "# Erinnerungen") {
			return i;
		}
	}
	return -1;
}

export interface ReminderItem {
	// Zeile ohne "- "-Präfix und ohne Datums-Suffix
	text: string;
	// null = datumslos (gilt als sofort fällig)
	date: Date | null;
	// exakte Originalzeile — Mutations-Schlüssel für remove/reschedule
	line: string;
	// 0-basiert in der Notiz (Sortier-Tiebreak, Cursor-Position)
	lineIndex: number;
}

// Liest alle Erinnerungs-Bullets aus der `# Erinnerungen`-Sektion (zwischen
// zweitem und drittem `---`-Trenner). Datums-Erkennung über das letzte
// `, <Datum>`-Segment via extractDateFromTitle; unparsebar → date null.
export function listReminders(content: string, locale: DateLocale): ReminderItem[] {
	const lines = content.split("\n");
	const thirdSep = findThirdSeparatorIndex(lines);
	if (thirdSep === -1) return [];

	const secondSep = findSecondSeparatorIndex(lines);
	const searchStart = secondSep !== -1 ? secondSep + 1 : 0;
	const erinnerungenIdx = findErinnerungenIndex(lines, searchStart, thirdSep);
	if (erinnerungenIdx === -1) return [];

	const items: ReminderItem[] = [];
	for (let i = erinnerungenIdx + 1; i < thirdSep; i++) {
		const line = lines[i];
		if (!line.startsWith("- ")) continue;
		const body = line.slice(2);
		const date = extractDateFromTitle(body, locale);
		const lastComma = body.lastIndexOf(", ");
		const text = date !== null && lastComma !== -1 ? body.slice(0, lastComma) : body;
		items.push({ text, date, line, lineIndex: i });
	}
	return items;
}

// Entfernt das erste Vorkommen der exakten Zeile; null = Zeile nicht gefunden.
export function removeReminderLine(content: string, line: string): { newContent: string } | null {
	const lines = content.split("\n");
	const idx = lines.indexOf(line);
	if (idx === -1) return null;
	lines.splice(idx, 1);
	return { newContent: lines.join("\n") };
}

// Schreibt das Datums-Suffix des ersten Vorkommens der exakten Zeile um;
// datumslose Zeilen erhalten erstmals ein Suffix. null = Zeile nicht gefunden.
export function rescheduleReminderLine(
	content: string,
	line: string,
	newDate: Date,
	locale: DateLocale,
): { newContent: string } | null {
	const lines = content.split("\n");
	const idx = lines.indexOf(line);
	if (idx === -1) return null;
	const body = line.startsWith("- ") ? line.slice(2) : line;
	const hadDate = extractDateFromTitle(body, locale) !== null;
	const lastComma = body.lastIndexOf(", ");
	const text = hadDate && lastComma !== -1 ? body.slice(0, lastComma) : body;
	lines[idx] = formatReminderEntry(text, locale, newDate);
	return { newContent: lines.join("\n") };
}

export function addReminder(content: string, entry: string): { newContent: string } | null {
	const lines = content.split("\n");
	const thirdSep = findThirdSeparatorIndex(lines);
	if (thirdSep === -1) {
		return null;
	}

	const secondSep = findSecondSeparatorIndex(lines);
	const searchStart = secondSep !== -1 ? secondSep + 1 : 0;

	const erinnerungenIdx = findErinnerungenIndex(lines, searchStart, thirdSep);

	if (erinnerungenIdx !== -1) {
		lines.splice(erinnerungenIdx + 1, 0, entry);
	} else {
		const lineBeforeThirdSep = thirdSep > 0 ? lines[thirdSep - 1] : "";
		const needsBlankBefore = lineBeforeThirdSep.trim() !== "";
		const toInsert = needsBlankBefore
			? ["", "# Erinnerungen", entry, ""]
			: ["# Erinnerungen", entry, ""];
		lines.splice(thirdSep, 0, ...toInsert);
	}

	return { newContent: lines.join("\n") };
}
