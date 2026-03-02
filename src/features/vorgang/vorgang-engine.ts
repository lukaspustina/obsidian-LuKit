import { formatDate, parseDateString } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";

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

function extractDateFromLine(line: string, locale: DateLocale): Date | null {
	const lastComma = line.lastIndexOf(", ");
	if (lastComma === -1) return null;
	const candidate = line.slice(lastComma + 2).replace(/\]\]+$/, "").trim();
	return parseDateString(candidate, locale);
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
		const existing = extractDateFromLine(lines[i], locale);
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
		const existing = extractDateFromLine(lines[i], locale);
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
	const lines = content.split("\n");
	const d = date ?? new Date();
	const bullet = formatVorgangBullet(name, locale, d);
	const header = formatVorgangHeader(name, locale, d);
	const inhaltIndex = findInhaltSectionIndex(lines);

	if (inhaltIndex === -1) {
		// Case 1: No # Inhalt — append everything at end
		const trimmed = content.trimEnd();
		const section = [
			"",
			"# Inhalt",
			"",
			bullet,
			"",
			header,
			"",
			"",
		].join("\n");
		const newContent = trimmed + section + "\n";
		const newLines = newContent.split("\n");
		const cursorLineIndex = newLines.length - 3;
		return { newContent, cursorLineIndex };
	}

	const bulletRange = findInhaltBulletRange(lines, inhaltIndex);

	if (bulletRange === null) {
		// Case 2: # Inhalt exists but no bullets
		// Insert bullet after Inhalt header
		const bulletInsertAt = inhaltIndex + 1;
		lines.splice(bulletInsertAt, 0, bullet);

		// Find correct h5 position by date
		const h5InsertAt = findH5InsertIndex(lines, bulletInsertAt + 1, d, locale);
		if (h5InsertAt !== -1) {
			lines.splice(h5InsertAt, 0, "", header, "", "");
			const cursorLineIndex = h5InsertAt + 2;
			return { newContent: lines.join("\n"), cursorLineIndex };
		}

		// No existing h5 — append at end
		const trimmedLines = trimTrailingEmptyLines(lines);
		trimmedLines.push("", header, "", "", "");
		const cursorLineIndex = trimmedLines.length - 3;
		return { newContent: trimmedLines.join("\n"), cursorLineIndex };
	}

	// Case 3: Normal — # Inhalt with existing bullets
	// Insert bullet at correct date position
	const bulletInsertAt = findBulletInsertIndex(lines, bulletRange.firstBullet, bulletRange.afterLastBullet, d, locale);
	lines.splice(bulletInsertAt, 0, bullet);

	// Find correct h5 position by date (adjust for inserted bullet line)
	const adjustedAfterLast = bulletRange.afterLastBullet + 1;
	const h5InsertAt = findH5InsertIndex(lines, adjustedAfterLast, d, locale);

	if (h5InsertAt !== -1) {
		lines.splice(h5InsertAt, 0, header, "", "");
		const cursorLineIndex = h5InsertAt + 1;
		return { newContent: lines.join("\n"), cursorLineIndex };
	}

	// No existing h5 — append at end
	const trimmedLines = trimTrailingEmptyLines(lines);
	trimmedLines.push("", header, "", "", "");
	const cursorLineIndex = trimmedLines.length - 3;
	return { newContent: trimmedLines.join("\n"), cursorLineIndex };
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	const result = [...lines];
	while (result.length > 0 && result[result.length - 1].trim() === "") {
		result.pop();
	}
	return result;
}
