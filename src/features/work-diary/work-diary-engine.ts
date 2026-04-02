import { formatDate, formatDateWithWeekday, parseDateString } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";

export function formatTodayHeader(locale: DateLocale, date?: Date): string {
	const d = date ?? new Date();
	return `##### ${formatDateWithWeekday(d, locale)}`;
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

export function findThirdSeparatorIndex(lines: string[]): number {
	return findNthSeparatorIndex(lines, 3);
}

export function findTodayHeaderIndex(lines: string[], afterLine: number, locale: DateLocale, date?: Date): number {
	const header = formatTodayHeader(locale, date);
	for (let i = afterLine + 1; i < lines.length; i++) {
		if (lines[i] === header) {
			return i;
		}
	}
	return -1;
}

function parseDiaryHeaderDate(header: string, locale: DateLocale): Date | null {
	const text = header.slice("##### ".length).trim();
	const lastComma = text.lastIndexOf(", ");
	const raw = lastComma !== -1 ? text.slice(lastComma + 2).trim() : text;
	return parseDateString(raw.replace(/\]+$/, ""), locale);
}

// Scans entries below the separator; returns the index of the first h5 header whose date
// is strictly older than `date`, inserting the new header just before it (reverse-chronological).
// Returns lines.length if no older header exists (append at end).
function findDiaryHeaderInsertPosition(
	lines: string[],
	separatorIndex: number,
	date: Date,
	locale: DateLocale,
): number {
	let lastH5Seen = -1;
	for (let i = separatorIndex + 1; i < lines.length; i++) {
		if (!lines[i].startsWith("##### ")) continue;
		lastH5Seen = i;
		const existing = parseDiaryHeaderDate(lines[i], locale);
		if (existing !== null && existing < date) {
			return i;
		}
	}
	return lastH5Seen === -1 ? separatorIndex + 1 : lines.length;
}

export function ensureTodayHeader(content: string, locale: DateLocale, date?: Date): { newContent: string; headerLineIndex: number; fallback: boolean } {
	const d = date ?? new Date();
	const lines = content.split("\n");
	const header = formatTodayHeader(locale, d);

	const separatorIndex = findThirdSeparatorIndex(lines);

	if (separatorIndex === -1) {
		// No third separator found — append separator + header at end
		const trimmedContent = content.trimEnd();
		const newContent = trimmedContent + "\n\n---\n" + header + "\n";
		const newLines = newContent.split("\n");
		const headerLineIndex = newLines.indexOf(header);
		return { newContent, headerLineIndex, fallback: true };
	}

	const existingIndex = findTodayHeaderIndex(lines, separatorIndex, locale, d);
	if (existingIndex !== -1) {
		return { newContent: content, headerLineIndex: existingIndex, fallback: false };
	}

	// Insert header at the correct date-ordered position (reverse-chronological)
	const insertAt = findDiaryHeaderInsertPosition(lines, separatorIndex, d, locale);
	const newLines = [...lines.slice(0, insertAt), header, ...lines.slice(insertAt)];
	return { newContent: newLines.join("\n"), headerLineIndex: insertAt, fallback: false };
}

export function entryExistsUnderToday(content: string, entry: string, locale: DateLocale, date?: Date): boolean {
	const lines = content.split("\n");
	const separatorIndex = findThirdSeparatorIndex(lines);
	if (separatorIndex === -1) return false;
	const todayIndex = findTodayHeaderIndex(lines, separatorIndex, locale, date);
	if (todayIndex === -1) return false;
	let i = todayIndex + 1;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.startsWith("- ") && !(line.length > 0 && /^\s/.test(line))) break;
		if (line === entry) return true;
		i++;
	}
	return false;
}

export function addEntryUnderToday(content: string, entry: string, locale: DateLocale, date?: Date): { newContent: string; entryLineIndex: number } {
	const { newContent: contentWithHeader, headerLineIndex } = ensureTodayHeader(content, locale, date);
	const lines = contentWithHeader.split("\n");

	// Find insertion point: after header, all top-level bullets, and any indented sub-content
	let insertAt = headerLineIndex + 1;
	while (insertAt < lines.length) {
		const line = lines[insertAt];
		if (line.startsWith("- ") || (line.length > 0 && /^\s/.test(line))) {
			insertAt++;
		} else {
			break;
		}
	}

	lines.splice(insertAt, 0, entry);
	return { newContent: lines.join("\n"), entryLineIndex: insertAt };
}

export function stripWikilinks(text: string): string {
	return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, target, display: string | undefined) => display ?? target);
}

export function formatDiaryEntry(noteName: string, heading: string | null): string {
	const safeName = noteName.replace(/\]\]|\|/g, "");
	if (heading) {
		const cleanHeading = stripWikilinks(heading).replace(/\]\]|\|/g, "");
		return `- [[${safeName}#${cleanHeading}|${safeName}: ${cleanHeading}]]`;
	}
	return `- [[${safeName}]]`;
}

export function formatTextEntry(text: string): string {
	return `- ${text}`;
}

export function formatReminderEntry(text: string, locale: DateLocale, date?: Date): string {
	const d = date ?? new Date();
	return `- ${text}, ${formatDate(d, locale)}`;
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
