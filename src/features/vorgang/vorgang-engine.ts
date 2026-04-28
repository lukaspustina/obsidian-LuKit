import { formatDate, extractDateFromTitle } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import {
	findInhaltSectionIndex,
	findInhaltBulletRange,
	formatLinkedBullet,
	stripTrailingBrackets,
	appendSectionAt,
} from "../../shared/note-structure";

export { findInhaltSectionIndex, findInhaltBulletRange, formatLinkedBullet };

export function formatVorgangHeadingText(name: string, locale: DateLocale, date?: Date): string {
	const d = date ?? new Date();
	return `${name}, ${formatDate(d, locale)}`;
}

export function formatVorgangHeader(name: string, locale: DateLocale, date?: Date): string {
	return `##### ${formatVorgangHeadingText(name, locale, date)}`;
}

export function formatVorgangBullet(name: string, locale: DateLocale, date?: Date): string {
	const d = date ?? new Date();
	return `- [[#${name}, ${formatDate(d, locale)}]]`;
}

function findBulletInsertIndex(
	lines: string[],
	firstBullet: number,
	afterLastBullet: number,
	newDate: Date,
	locale: DateLocale,
): number {
	for (let i = firstBullet; i < afterLastBullet; i++) {
		if (!lines[i].startsWith("- ")) continue;
		const existing = extractDateFromTitle(stripTrailingBrackets(lines[i]), locale);
		if (existing === null || existing <= newDate) {
			return i;
		}
	}
	return afterLastBullet;
}

function findH5InsertIndex(
	lines: string[],
	fromIndex: number,
	newDate: Date,
	locale: DateLocale,
): number {
	for (let i = fromIndex; i < lines.length; i++) {
		if (!lines[i].startsWith("##### ")) continue;
		const existing = extractDateFromTitle(stripTrailingBrackets(lines[i]), locale);
		if (existing === null || existing <= newDate) {
			return i;
		}
	}
	return -1;
}

export function addVorgangSection(
	content: string,
	name: string,
	locale: DateLocale,
	date?: Date,
): { newContent: string; cursorLineIndex: number } {
	const d = date ?? new Date();
	const bullet = formatVorgangBullet(name, locale, d);
	const header = formatVorgangHeader(name, locale, d);
	return insertVorgangContent(content, bullet, header, [], d, locale);
}

// Used by besprechung-feature.ts to insert a meeting note section with body lines.
export function addVorgangSectionLinked(
	content: string,
	noteName: string,
	locale: DateLocale,
	date: Date,
	bodyLines: string[] = [],
): { newContent: string; cursorLineIndex: number } {
	const nameDate = extractDateFromTitle(noteName, locale);
	const nameAlreadyHasDate = nameDate !== null;
	// When the note name carries its own date, sort by that date so placement
	// matches the displayed date in the bullet/header.
	const sortDate = nameDate ?? date;
	const bullet = formatLinkedBullet(noteName, locale, date);
	const header = nameAlreadyHasDate
		? `##### [[${noteName}]]`
		: `##### [[${noteName}]], ${formatDate(date, locale)}`;
	return insertVorgangContent(content, bullet, header, bodyLines, sortDate, locale);
}

function insertVorgangContent(
	content: string,
	bullet: string,
	header: string,
	bodyLines: string[],
	date: Date,
	locale: DateLocale,
): { newContent: string; cursorLineIndex: number } {
	const lines = content.split("\n");
	const hasBody = bodyLines.length > 0;
	const inhaltIndex = findInhaltSectionIndex(lines);

	if (inhaltIndex === -1) {
		// Case 1: No # Inhalt section yet — build full structure from scratch and append
		const trimmed = content.trimEnd();
		if (hasBody) {
			const section = ["", "# Inhalt", "", bullet, "", header, ...bodyLines, ""].join("\n");
			const newContent = trimmed + section + "\n";
			const newLines = newContent.split("\n");
			return { newContent, cursorLineIndex: newLines.length - 2 };
		}
		const section = ["", "# Inhalt", "", bullet, "", header, "", ""].join("\n");
		const newContent = trimmed + section + "\n";
		const newLines = newContent.split("\n");
		return { newContent, cursorLineIndex: newLines.length - 3 };
	}

	const bulletRange = findInhaltBulletRange(lines, inhaltIndex);

	if (bulletRange === null) {
		// Case 2: # Inhalt exists but has no bullets yet
		const bulletInsertAt = inhaltIndex + 1;
		lines.splice(bulletInsertAt, 0, bullet);

		const h5InsertAt = findH5InsertIndex(lines, bulletInsertAt + 1, date, locale);
		const insertAt = h5InsertAt !== -1 ? h5InsertAt : trimTrailingEmptyLines(lines).length;
		const sourceLines = h5InsertAt !== -1 ? lines : trimTrailingEmptyLines(lines);
		const result = appendSectionAt(sourceLines, insertAt, header, bodyLines);
		return { newContent: result.lines.join("\n"), cursorLineIndex: result.cursorLineIndex };
	}

	// Case 3: Normal — # Inhalt with existing bullets; insert in date order
	const bulletInsertAt = findBulletInsertIndex(lines, bulletRange.firstBullet, bulletRange.afterLastBullet, date, locale);
	lines.splice(bulletInsertAt, 0, bullet);

	const adjustedAfterLast = bulletRange.afterLastBullet + 1;
	const h5InsertAt = findH5InsertIndex(lines, adjustedAfterLast, date, locale);

	const insertAt = h5InsertAt !== -1 ? h5InsertAt : trimTrailingEmptyLines(lines).length;
	const sourceLines = h5InsertAt !== -1 ? lines : trimTrailingEmptyLines(lines);
	const result = appendSectionAt(sourceLines, insertAt, header, bodyLines);
	return { newContent: result.lines.join("\n"), cursorLineIndex: result.cursorLineIndex };
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	const result = [...lines];
	while (result.length > 0 && result[result.length - 1].trim() === "") {
		result.pop();
	}
	return result;
}
