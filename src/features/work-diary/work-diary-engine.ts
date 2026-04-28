import { formatDate } from "../../shared/date-format";
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
