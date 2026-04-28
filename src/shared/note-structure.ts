import { formatDate, extractDateFromTitle } from "./date-format";
import type { DateLocale } from "./date-format";

export function findInhaltSectionIndex(lines: string[]): number {
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "# Inhalt") {
			return i;
		}
	}
	return -1;
}

export function findInhaltBulletRange(
	lines: string[],
	inhaltIndex: number,
): { firstBullet: number; afterLastBullet: number } | null {
	let firstBullet = -1;
	for (let i = inhaltIndex + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith("#")) {
			break;
		}
		if (line.startsWith("- ")) {
			if (firstBullet === -1) {
				firstBullet = i;
			}
		} else if (firstBullet !== -1 && line.trim() !== "") {
			break;
		}
	}
	if (firstBullet === -1) {
		return null;
	}
	let afterLastBullet = firstBullet + 1;
	for (let i = firstBullet + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith("- ")) {
			afterLastBullet = i + 1;
		} else if (line.trim() === "") {
			continue;
		} else {
			break;
		}
	}
	return { firstBullet, afterLastBullet };
}

// Returns the bullet string for a section linked to a note (used for both
// insertion and duplicate detection). When the noteName already ends with a
// date, the bullet is a bare anchor `- [[#noteName]]`; otherwise a date is
// appended.
export function formatLinkedBullet(noteName: string, locale: DateLocale, date: Date): string {
	const nameAlreadyHasDate = extractDateFromTitle(noteName, locale) !== null;
	return nameAlreadyHasDate
		? `- [[#${noteName}]]`
		: `- [[#${noteName}, ${formatDate(date, locale)}]]`;
}

// Strips trailing `]]` from a string. Used when parsing dates out of wikilink-
// shaped lines (e.g. `##### [[Name, 19.03.2026]]`) so the date parser sees a
// clean `DD.MM.YYYY` candidate.
export function stripTrailingBrackets(s: string): string {
	return s.replace(/\]+$/, "");
}
