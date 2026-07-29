import { formatDate, extractDateFromTitle } from "../../shared/date-format";
import type { DateLocale } from "../../shared/date-format";
import {
	findInhaltSectionIndex,
	findInhaltBulletRange,
	formatLinkedBullet,
	stripTrailingBrackets,
	appendSectionAt,
	tocAlreadyLinks,
	extractWikilinkTarget,
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

// Zeitstempel im Format des Vault-Templates ("YYYY-MM-DD HH:mm:ss") für das
// Frontmatter-Feld "Created at" beim Umwandeln einer Notiz.
// Wendet das Typ-Präfix ("<Typ> - ") auf einen Notiz-Titel an: fehlendes
// Präfix wird vorangestellt, ein anderes Zielnotiz-Präfix ersetzt, das
// richtige bleibt unverändert.
export function applyTypePrefix(basename: string, tag: string, allTags: ReadonlySet<string>): string {
	if (basename.startsWith(`${tag} - `)) return basename;
	for (const other of allTags) {
		if (basename.startsWith(`${other} - `)) {
			return `${tag} - ${basename.slice(other.length + 3)}`;
		}
	}
	return `${tag} - ${basename}`;
}

export function formatCreatedAtTimestamp(date: Date): string {
	const p = (n: number): string => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export function addVorgangSection(
	content: string,
	name: string,
	locale: DateLocale,
	date?: Date,
	bodyLines: string[] = [],
): { newContent: string; cursorLineIndex: number } {
	const d = date ?? new Date();
	const bullet = formatVorgangBullet(name, locale, d);
	const header = formatVorgangHeader(name, locale, d);
	return insertVorgangContent(content, bullet, header, bodyLines, d, locale);
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

// „Aktuelle Notiz umwandeln": ergänzt das Zielnotiz-Skelett (# Fakten und
// Pointer / # Nächste Schritte / # Inhalt). Ein bestehender Body wandert in
// eine datierte h5-Sektion „Notiz" mit TOC-Eintrag; Notizen, die bereits
// # Inhalt oder # Fakten und Pointer enthalten, bleiben unverändert.
export function ensureVorgangSkeleton(content: string, locale: DateLocale, date: Date): string {
	const lines = content.split("\n");
	if (lines.some((l) => l.trim() === "# Inhalt" || l.trim() === "# Fakten und Pointer")) return content;
	const fmEnd = findFrontmatterEndIndex(lines);
	const frontmatterLines = fmEnd === -1 ? [] : lines.slice(0, fmEnd + 1);
	const body = lines.slice(fmEnd + 1);
	while (body.length > 0 && body[0].trim() === "") body.shift();
	const bodyLines = trimTrailingEmptyLines(body);
	const skeletonLines =
		fmEnd === -1
			? ["# Fakten und Pointer", "", "# Nächste Schritte", "", "# Inhalt"]
			: [...frontmatterLines, "", "# Fakten und Pointer", "", "# Nächste Schritte", "", "# Inhalt"];
	const skeleton = skeletonLines.join("\n") + "\n";
	if (bodyLines.length === 0) return skeleton;
	const bullet = formatVorgangBullet("Notiz", locale, date);
	const header = formatVorgangHeader("Notiz", locale, date);
	return insertVorgangContent(skeleton, bullet, header, bodyLines, date, locale).newContent;
}

export function insertVorgangContent(
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

// Returns the index of the closing "---" of a frontmatter block, or -1 when
// there is no frontmatter (first line is not "---"). Shared by
// mergeVorgangContent and buildStubContent.
function findFrontmatterEndIndex(lines: string[]): number {
	if (lines[0] !== "---") return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") return i;
	}
	return -1;
}

// Extracts the body of a "# <header>" section (lines after the header up to
// the next h1-h5 heading), verbatim, not trimmed.
function sliceSectionBody(lines: string[], header: string): string[] {
	const start = lines.findIndex((l) => l.trim() === header);
	if (start === -1) return [];
	const body: string[] = [];
	for (let i = start + 1; i < lines.length; i++) {
		if (/^#{1,5} /.test(lines[i])) break;
		body.push(lines[i]);
	}
	return body;
}

interface SourceH5Section {
	header: string;
	headingText: string;
	body: string[];
	date: Date | null;
}

// Enumerates the source's h5 sections (header + body up to the next h1-h5
// heading). Content before the first "##### " header never opens a section.
function parseH5Sections(lines: string[], locale: DateLocale): SourceH5Section[] {
	const sections: SourceH5Section[] = [];
	let i = 0;
	while (i < lines.length) {
		if (!lines[i].startsWith("##### ")) {
			i++;
			continue;
		}
		const header = lines[i];
		const headingText = header.slice(6);
		const body: string[] = [];
		i++;
		while (i < lines.length && !/^#{1,5} /.test(lines[i])) {
			body.push(lines[i]);
			i++;
		}
		while (body.length > 0 && body[body.length - 1].trim() === "") {
			body.pop();
		}
		const date = extractDateFromTitle(stripTrailingBrackets(headingText), locale);
		sections.push({ header, headingText, body, date });
	}
	return sections;
}

// Appends newLines to an existing "# header" section (right after its last
// non-empty line, no inserted blank), or creates the section when missing:
// after createAfterHeader's content range when that section exists, else
// directly after the frontmatter.
function mergeH1Section(
	content: string,
	header: string,
	newLines: string[],
	createAfterHeader: string | null,
): string {
	const lines = content.split("\n");
	const headerIndex = lines.findIndex((l) => l.trim() === header);

	if (headerIndex !== -1) {
		let rangeEnd = lines.length;
		for (let i = headerIndex + 1; i < lines.length; i++) {
			if (/^#{1,5} /.test(lines[i])) {
				rangeEnd = i;
				break;
			}
		}
		let lastNonEmpty = headerIndex;
		for (let i = headerIndex + 1; i < rangeEnd; i++) {
			if (lines[i].trim() !== "") lastNonEmpty = i;
		}
		lines.splice(lastNonEmpty + 1, 0, ...newLines);
		return lines.join("\n");
	}

	let insertAt: number;
	const afterIndex = createAfterHeader !== null ? lines.findIndex((l) => l.trim() === createAfterHeader) : -1;
	if (afterIndex !== -1) {
		insertAt = lines.length;
		for (let i = afterIndex + 1; i < lines.length; i++) {
			if (/^#{1,5} /.test(lines[i])) {
				insertAt = i;
				break;
			}
		}
	} else {
		insertAt = findFrontmatterEndIndex(lines) + 1;
	}
	lines.splice(insertAt, 0, header, ...newLines);
	return lines.join("\n");
}

// Kanonischer Header zuerst; „# Fakten" ist der Legacy-Name, den
// migration-engine.ts auf „Fakten und Pointer" umbenennt — noch nicht
// migrierte Notizen sollen das Entscheidungs-Log trotzdem bekommen.
const FAKTEN_HEADERS = ["# Fakten und Pointer", "# Fakten"];
// Fixed concept label for the decisions log — deliberately not derived from the
// configured heading name, so a renamed source heading does not fragment the log.
const DECISION_BULLET_PREFIX = "- Entscheidungen ";

// Appends a besprechung's decisions as one grouped bullet under
// "# Fakten und Pointer": a parent bullet linking the besprechung, with each
// decision as a sub-bullet. The block goes above the first existing decision
// block (so the log reads newest-first like # Inhalt does) but below manually
// maintained facts. Deliberately diverges from mergeH1Section, which appends at
// the section end and creates the section when missing: a missing Fakten
// section is a no-op here — creating structure is ensureVorgangSkeleton's job.
export function appendDecisionsToFakten(
	content: string,
	besprechungBasename: string,
	decisionLines: string[],
	locale: DateLocale,
	date: Date,
): { content: string; insertedLines: number } {
	if (decisionLines.length === 0) return { content, insertedLines: 0 };

	const lines = content.split("\n");
	let headerIndex = -1;
	for (const header of FAKTEN_HEADERS) {
		headerIndex = lines.findIndex((l) => l.trim() === header);
		if (headerIndex !== -1) break;
	}
	if (headerIndex === -1) return { content, insertedLines: 0 };

	let rangeEnd = lines.length;
	for (let i = headerIndex + 1; i < lines.length; i++) {
		if (/^#{1,5} /.test(lines[i])) {
			rangeEnd = i;
			break;
		}
	}

	const link = `([[${besprechungBasename}]])`;
	let firstDecisionIndex = -1;
	for (let i = headerIndex + 1; i < rangeEnd; i++) {
		if (!lines[i].startsWith(DECISION_BULLET_PREFIX)) continue;
		// Same besprechung already logged — nothing to add.
		if (lines[i].includes(link)) return { content, insertedLines: 0 };
		if (firstDecisionIndex === -1) firstDecisionIndex = i;
	}

	let insertAt: number;
	if (firstDecisionIndex !== -1) {
		insertAt = firstDecisionIndex;
	} else {
		let lastNonEmpty = headerIndex;
		for (let i = headerIndex + 1; i < rangeEnd; i++) {
			if (lines[i].trim() !== "") lastNonEmpty = i;
		}
		insertAt = lastNonEmpty + 1;
	}

	const block = [
		`${DECISION_BULLET_PREFIX}${formatDate(date, locale)} ${link}`,
		...decisionLines.map((l) => `    ${l}`),
	];
	lines.splice(insertAt, 0, ...block);
	return { content: lines.join("\n"), insertedLines: block.length };
}

// Merges a source Vorgang's Fakten/Nächste-Schritte bullets and h5 sections
// into a target Vorgang's content. Pure — mergeDate is passed in so dateless
// source sections resolve deterministically.
export function mergeVorgangContent(
	sourceContent: string,
	targetContent: string,
	locale: DateLocale,
	mergeDate: Date,
): { newTargetContent: string; mergedSections: number; skippedDuplicates: number } {
	const sourceLines = sourceContent.split("\n");
	const originalTargetLines = targetContent.split("\n");
	let working = targetContent;

	const faktenBody = sliceSectionBody(sourceLines, "# Fakten und Pointer").filter((l) => l.trim() !== "");
	if (faktenBody.length > 0) {
		working = mergeH1Section(working, "# Fakten und Pointer", faktenBody, null);
	}

	const nsBody = sliceSectionBody(sourceLines, "# Nächste Schritte").filter((l) => l.trim() !== "");
	if (nsBody.length > 0) {
		working = mergeH1Section(working, "# Nächste Schritte", nsBody, "# Fakten und Pointer");
	}

	const sections = parseH5Sections(sourceLines, locale);
	let mergedSections = 0;
	let skippedDuplicates = 0;
	for (const sec of [...sections].reverse()) {
		const linkTarget = extractWikilinkTarget(sec.header);
		if (linkTarget !== null && tocAlreadyLinks(originalTargetLines, linkTarget)) {
			skippedDuplicates++;
			continue;
		}
		const sortDate = sec.date ?? mergeDate;
		const tocName = linkTarget ?? sec.headingText;
		const bullet = formatLinkedBullet(tocName, locale, sortDate);
		const { newContent } = insertVorgangContent(working, bullet, sec.header, sec.body, sortDate, locale);
		working = newContent;
		mergedSections++;
	}

	return { newTargetContent: working, mergedSections, skippedDuplicates };
}

// Builds the stub body for a merged-away source Vorgang: the frontmatter
// block byte-identical, a blank line, then the merge-reference sentence.
// Notes without frontmatter get just the sentence.
export function buildStubContent(liveContent: string, targetBasename: string): string {
	const lines = liveContent.split("\n");
	const fmEnd = findFrontmatterEndIndex(lines);
	const sentence = `Zusammengeführt in [[${targetBasename}]].`;
	if (fmEnd === -1) return `${sentence}\n`;
	const frontmatter = lines.slice(0, fmEnd + 1).join("\n");
	return `${frontmatter}\n\n${sentence}\n`;
}
