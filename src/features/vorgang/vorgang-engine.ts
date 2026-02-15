export function formatGermanDate(date?: Date): string {
	const d = date ?? new Date();
	const day = String(d.getDate()).padStart(2, "0");
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const year = d.getFullYear();
	return `${day}.${month}.${year}`;
}

export function formatVorgangHeadingText(name: string, date?: Date): string {
	return `${name}, ${formatGermanDate(date)}`;
}

export function formatVorgangHeader(name: string, date?: Date): string {
	return `##### ${formatVorgangHeadingText(name, date)}`;
}

export function formatVorgangBullet(name: string, date?: Date): string {
	return `- [[#${name}, ${formatGermanDate(date)}]]`;
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

function findFirstH5Index(lines: string[], afterIndex: number): number {
	for (let i = afterIndex; i < lines.length; i++) {
		if (lines[i].startsWith("##### ")) {
			return i;
		}
	}
	return -1;
}

export function addVorgangSection(
	content: string,
	name: string,
	date?: Date,
): { newContent: string; cursorLineIndex: number } {
	const lines = content.split("\n");
	const bullet = formatVorgangBullet(name, date);
	const header = formatVorgangHeader(name, date);
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

		// Find first ##### after the Inhalt section to insert h5 before it
		const firstH5 = findFirstH5Index(lines, bulletInsertAt + 1);
		if (firstH5 !== -1) {
			lines.splice(firstH5, 0, "", header, "", "");
			const cursorLineIndex = firstH5 + 2;
			return { newContent: lines.join("\n"), cursorLineIndex };
		}

		// No existing h5 — append at end
		const trimmedLines = trimTrailingEmptyLines(lines);
		trimmedLines.push("", header, "", "", "");
		const cursorLineIndex = trimmedLines.length - 3;
		return { newContent: trimmedLines.join("\n"), cursorLineIndex };
	}

	// Case 3: Normal — # Inhalt with existing bullets
	// Insert bullet as first item under # Inhalt
	lines.splice(bulletRange.firstBullet, 0, bullet);

	// Find first ##### after the bullet list (adjusted for inserted line)
	const adjustedAfterLast = bulletRange.afterLastBullet + 1;
	const firstH5 = findFirstH5Index(lines, adjustedAfterLast);

	if (firstH5 !== -1) {
		lines.splice(firstH5, 0, header, "", "");
		const cursorLineIndex = firstH5 + 1;
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
