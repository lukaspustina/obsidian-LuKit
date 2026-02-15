import {
	findInhaltSectionIndex,
	findInhaltBulletRange,
} from "../vorgang/vorgang-engine";

export interface MigrationResult {
	newContent: string;
	changeCount: number;
}

export interface MigrationOptions {
	addTag?: string;
}

const KNOWN_TOP_LEVEL_SECTIONS: ReadonlySet<string> = new Set([
	"fakten",
	"fakten und pointer",
	"nächste schritte",
	"inhalt",
]);

const SECTION_RENAMES: ReadonlyMap<string, string> = new Map([
	["fakten", "Fakten und Pointer"],
]);

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

export function isKnownTopLevelSection(name: string): boolean {
	return KNOWN_TOP_LEVEL_SECTIONS.has(name.toLowerCase());
}

export function getTopLevelSectionName(name: string): string {
	const lower = name.toLowerCase();
	const renamed = SECTION_RENAMES.get(lower);
	if (renamed) {
		return renamed;
	}
	return name.charAt(0).toUpperCase() + name.slice(1);
}

export function convertTopLevelBoldToH1(lines: string[]): number {
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
		if (result && isKnownTopLevelSection(result.inner)) {
			lines[i] = `# ${getTopLevelSectionName(result.inner)}`;
			changeCount++;
		}
	}
	return changeCount;
}

export function convertEntryBoldToH5(lines: string[]): number {
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
		if (result && !isKnownTopLevelSection(result.inner)) {
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

export function addFrontmatterTag(lines: string[], tag: string): number {
	if (lines.length === 0 || lines[0].trim() !== "---") {
		return 0;
	}

	let closingIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			closingIndex = i;
			break;
		}
	}
	if (closingIndex === -1) {
		return 0;
	}

	let tagsLineIndex = -1;
	for (let i = 1; i < closingIndex; i++) {
		if (lines[i].startsWith("tags:")) {
			tagsLineIndex = i;
			break;
		}
	}

	if (tagsLineIndex === -1) {
		lines.splice(closingIndex, 0, "tags:", `  - ${tag}`);
		return 1;
	}

	const tagsLine = lines[tagsLineIndex];

	// Handle inline format: tags: [tag1, tag2]
	const inlineMatch = tagsLine.match(/^tags:\s*\[(.+)\]$/);
	if (inlineMatch) {
		const existingTags = inlineMatch[1].split(",").map((t) => t.trim());
		if (existingTags.includes(tag)) {
			return 0;
		}
		existingTags.push(tag);
		lines[tagsLineIndex] = `tags: [${existingTags.join(", ")}]`;
		return 1;
	}

	// Handle list format — collect tag items
	const tagItems: string[] = [];
	let lastTagItemIndex = tagsLineIndex;
	for (let i = tagsLineIndex + 1; i < closingIndex; i++) {
		const match = lines[i].match(/^\s+-\s+(.+)$/);
		if (match) {
			tagItems.push(match[1]);
			lastTagItemIndex = i;
		} else {
			break;
		}
	}

	// Handle empty tags field with no list items
	if (tagsLine.trim() === "tags:" && tagItems.length === 0) {
		lines.splice(tagsLineIndex + 1, 0, `  - ${tag}`);
		return 1;
	}

	// Check if tag already exists in list
	if (tagItems.includes(tag)) {
		return 0;
	}

	lines.splice(lastTagItemIndex + 1, 0, `  - ${tag}`);
	return 1;
}

export function detectNoteType(content: string): "vorgang" | "diary" {
	const lines = content.split("\n");
	for (const line of lines) {
		if (line.trim() === "# Inhalt") {
			return "vorgang";
		}
		const bold = isStandaloneBold(line);
		if (bold && bold.inner.toLowerCase() === "inhalt") {
			return "vorgang";
		}
	}
	return "diary";
}

export function migrateVorgangNote(
	content: string,
	options?: MigrationOptions,
): MigrationResult {
	const lines = content.split("\n");
	const h1Changes = convertTopLevelBoldToH1(lines);
	const h5Changes = convertEntryBoldToH5(lines);
	const tocChanges = convertTocEntries(lines);
	const tagChanges = options?.addTag
		? addFrontmatterTag(lines, options.addTag)
		: 0;
	return {
		newContent: lines.join("\n"),
		changeCount: h1Changes + h5Changes + tocChanges + tagChanges,
	};
}

export function migrateDiaryNote(content: string): MigrationResult {
	const lines = content.split("\n");
	const boldChanges = convertEntryBoldToH5(lines);
	return {
		newContent: lines.join("\n"),
		changeCount: boldChanges,
	};
}
