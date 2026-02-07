import {
	findInhaltSectionIndex,
	findInhaltBulletRange,
} from "../absatz/absatz-engine";

export interface MigrationResult {
	newContent: string;
	changeCount: number;
}

export function isStandaloneBold(line: string): { inner: string } | null {
	const trimmed = line.trim();
	const match = trimmed.match(/^\*\*(.+)\*\*$/);
	if (!match) {
		return null;
	}
	const inner = match[1];
	if (inner.includes("**") || inner.trim() === "") {
		return null;
	}
	return { inner };
}

export function convertBoldToH5(lines: string[]): number {
	let changeCount = 0;
	let inFrontmatter = false;
	let frontmatterOpened = false;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			if (!frontmatterOpened) {
				inFrontmatter = true;
				frontmatterOpened = true;
				continue;
			}
			if (inFrontmatter) {
				inFrontmatter = false;
				continue;
			}
		}
		if (inFrontmatter) {
			continue;
		}
		const result = isStandaloneBold(lines[i]);
		if (result) {
			lines[i] = `##### ${result.inner}`;
			changeCount++;
		}
	}
	return changeCount;
}

export function convertTocEntries(lines: string[]): number {
	const inhaltIndex = findInhaltSectionIndex(lines);
	if (inhaltIndex === -1) {
		return 0;
	}

	const range = findInhaltBulletRange(lines, inhaltIndex);
	if (!range) {
		return 0;
	}

	let changeCount = 0;
	for (let i = range.firstBullet; i < range.afterLastBullet; i++) {
		const line = lines[i];
		if (!line.startsWith("- ")) {
			continue;
		}
		const entry = line.slice(2);
		if (entry.startsWith("[[") && entry.endsWith("]]")) {
			continue;
		}
		if (entry.trim() === "") {
			continue;
		}
		lines[i] = `- [[#${entry}]]`;
		changeCount++;
	}
	return changeCount;
}

export function migrateVorgangNote(content: string): MigrationResult {
	const lines = content.split("\n");
	const boldChanges = convertBoldToH5(lines);
	const tocChanges = convertTocEntries(lines);
	return {
		newContent: lines.join("\n"),
		changeCount: boldChanges + tocChanges,
	};
}
