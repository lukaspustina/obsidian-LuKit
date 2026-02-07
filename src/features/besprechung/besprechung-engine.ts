export function extractSection(content: string, heading: string): string | null {
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
		if (lines[i].trimEnd().startsWith("### ")) {
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

export function formatBesprechungSummary(content: string): string | null {
	const naechsteSchritte = extractSection(content, "Nächste Schritte");
	const zusammenfassung = extractSection(content, "Zusammenfassung");

	if (!naechsteSchritte && !zusammenfassung) {
		return null;
	}

	const parts: string[] = [];

	if (naechsteSchritte) {
		parts.push(`**Nächste Schritte**\n${naechsteSchritte}`);
	}

	if (zusammenfassung) {
		parts.push(`**Zusammenfassung**\n${zusammenfassung}`);
	}

	return parts.join("\n\n");
}
