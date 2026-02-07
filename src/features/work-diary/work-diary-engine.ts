const GERMAN_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function formatTodayHeader(date?: Date): string {
	const d = date ?? new Date();
	const weekday = GERMAN_WEEKDAYS[d.getDay()];
	const day = String(d.getDate()).padStart(2, "0");
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const year = d.getFullYear();
	return `##### ${weekday}, ${day}.${month}.${year}`;
}

export function findThirdSeparatorIndex(lines: string[]): number {
	let separatorCount = 0;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			separatorCount++;
			if (separatorCount === 3) {
				return i;
			}
		}
	}
	return -1;
}

export function findTodayHeaderIndex(lines: string[], afterLine: number, date?: Date): number {
	const header = formatTodayHeader(date);
	for (let i = afterLine + 1; i < lines.length; i++) {
		if (lines[i] === header) {
			return i;
		}
	}
	return -1;
}

export function ensureTodayHeader(content: string, date?: Date): { newContent: string; headerLineIndex: number; fallback: boolean } {
	const lines = content.split("\n");
	const header = formatTodayHeader(date);

	const separatorIndex = findThirdSeparatorIndex(lines);

	if (separatorIndex === -1) {
		// No third separator found — append separator + header at end
		const trimmedContent = content.trimEnd();
		const newContent = trimmedContent + "\n\n---\n" + header + "\n";
		const newLines = newContent.split("\n");
		const headerLineIndex = newLines.indexOf(header);
		return { newContent, headerLineIndex, fallback: true };
	}

	const existingIndex = findTodayHeaderIndex(lines, separatorIndex, date);
	if (existingIndex !== -1) {
		return { newContent: content, headerLineIndex: existingIndex, fallback: false };
	}

	// Insert header after separator, with a blank line in between
	const before = lines.slice(0, separatorIndex + 1);
	const after = lines.slice(separatorIndex + 1);
	const newLines = [...before, header, ...after];
	return { newContent: newLines.join("\n"), headerLineIndex: separatorIndex + 1, fallback: false };
}

export function validateDiaryStructure(content: string): string[] {
	const lines = content.split("\n");
	const errors: string[] = [];

	const separatorIndex = findThirdSeparatorIndex(lines);
	if (separatorIndex === -1) {
		errors.push("Missing third separator (---). Diary entries may be misplaced.");
	}

	return errors;
}

export function addEntryUnderToday(content: string, entry: string, date?: Date): { newContent: string; entryLineIndex: number } {
	const { newContent: contentWithHeader, headerLineIndex } = ensureTodayHeader(content, date);
	const lines = contentWithHeader.split("\n");

	// Find insertion point: right after header and any existing entries
	let insertAt = headerLineIndex + 1;
	while (insertAt < lines.length && lines[insertAt].startsWith("- ")) {
		insertAt++;
	}

	lines.splice(insertAt, 0, entry);
	return { newContent: lines.join("\n"), entryLineIndex: insertAt };
}

export function formatDiaryEntry(noteName: string, heading: string | null): string {
	if (heading) {
		return `- [[${noteName}#${heading}|${noteName}: ${heading}]]`;
	}
	return `- [[${noteName}]]`;
}

export function formatTextEntry(text: string): string {
	return `- ${text}`;
}

export function formatReminderEntry(text: string, date?: Date): string {
	const d = date ?? new Date();
	const day = String(d.getDate()).padStart(2, "0");
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const year = d.getFullYear();
	return `- ${text}, ${day}.${month}.${year}`;
}

function findSecondSeparatorIndex(lines: string[]): number {
	let count = 0;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			count++;
			if (count === 2) {
				return i;
			}
		}
	}
	return -1;
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
