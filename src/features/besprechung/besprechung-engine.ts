export function extractCreatedDate(content: string): Date | null {
	const match = /^created:\s*(.+)$/m.exec(content);
	if (!match) return null;
	const d = new Date(match[1].trim());
	return isNaN(d.getTime()) ? null : d;
}

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

	// Trim leading and trailing blank lines
	while (body.length > 0 && body[0].trim() === "") {
		body.shift();
	}
	while (body.length > 0 && body[body.length - 1].trim() === "") {
		body.pop();
	}

	if (body.length === 0) {
		return null;
	}

	return body.join("\n");
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

export function formatBesprechungSummary(
	content: string,
	sectionHeadings: string[] = ["Nächste Schritte", "Zusammenfassung"],
): string | null {
	const parts: string[] = [];

	for (const heading of sectionHeadings) {
		const body = extractSection(content, heading);
		if (body) {
			parts.push(`**${heading}**\n${removeBlankAdjacentToLabel(body)}`);
		}
	}

	if (parts.length === 0) {
		return null;
	}

	return parts.join("\n\n");
}
