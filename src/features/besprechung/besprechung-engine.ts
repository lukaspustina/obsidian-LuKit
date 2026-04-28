export {
	frontmatterTagsInclude,
	removeTagFromFrontmatter,
	extractCreatedDate,
} from "../../shared/frontmatter";

export function extractSection(content: string, heading: string, bulletsOnly = false): string | null {
	const lines = content.split("\n");
	const target = `### ${heading}`;

	let startIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === target) {
			startIdx = i + 1;
			break;
		}
	}

	if (startIdx === -1) {
		return null;
	}

	let endIdx = lines.length;
	for (let i = startIdx; i < lines.length; i++) {
		if (/^#{1,3} /.test(lines[i])) {
			endIdx = i;
			break;
		}
		if (bulletsOnly && lines[i].trim() !== "" && !lines[i].startsWith("- ")) {
			endIdx = i;
			break;
		}
	}

	const body = lines.slice(startIdx, endIdx);

	let start = 0;
	let end = body.length;
	while (start < end && body[start].trim() === "") start++;
	while (end > start && body[end - 1].trim() === "") end--;

	if (start >= end) {
		return null;
	}

	return body.slice(start, end).join("\n");
}

function removeBlankAdjacentToLabel(body: string): string {
	const lines = body.split("\n");
	const result: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const prev = result[result.length - 1];
		const next = lines[i + 1];
		const isBlank = line.trim() === "";
		const isLabel = (s: string | undefined) => s !== undefined && s.trim() !== "" && !s.startsWith("- ");
		if (isBlank && (isLabel(prev) || isLabel(next))) {
			continue;
		}
		result.push(line);
	}
	return result.join("\n");
}

// Records the filing target on the besprechung's frontmatter so future
// automation can learn the user's filing patterns from a structured corpus.
export function markFiledInFrontmatter(
	fm: Record<string, unknown>,
	vorgangBasename: string,
	when: Date,
): void {
	fm.filed_into = `[[${vorgangBasename}]]`;
	fm.filed_at = when.toISOString();
}

export interface BesprechungSummary {
	body: string;
	missing: string[];
}

export function formatBesprechungSummary(
	content: string,
	sectionHeadings: string[] = ["Nächste Schritte", "Zusammenfassung"],
): BesprechungSummary {
	const parts: string[] = [];
	const missing: string[] = [];

	for (const heading of sectionHeadings) {
		const body = extractSection(content, heading);
		if (body) {
			parts.push(`**${heading}**\n${removeBlankAdjacentToLabel(body)}`);
		} else {
			missing.push(heading);
		}
	}

	return { body: parts.join("\n\n"), missing };
}

// Composes the final insertion text. When some configured sections are missing,
// appends a "see source" line with a wikilink so the user can open the
// besprechung to read what wasn't extracted.
export function composeBesprechungInsertion(
	summary: BesprechungSummary,
	besprechungBasename: string,
): string {
	if (summary.missing.length === 0) return summary.body;
	const link = `→ See full notes: [[${besprechungBasename}]] (missing: ${summary.missing.join(", ")})`;
	return summary.body === "" ? link : `${summary.body}\n\n${link}`;
}
