import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_EXTENSIONS } from "../../src/features/office-previews/office-previews-engine";

const EXPECTED = ["docx", "doc", "xlsx", "xls", "pptx", "ppt", "pages", "numbers", "key", "odt", "ods", "odp"];
const ALLOWED = ["pass", "fail", "no sample"];
// The experiment is recorded in the SDD itself, which /sdd-finish archives to
// specs/done/sdd/office-previews-<date>.md (the report is deleted there).
function sddPath(): string {
	const active = join(process.cwd(), "specs", "sdd", "office-previews.md");
	if (existsSync(active)) return active;
	const done = join(process.cwd(), "specs", "done", "sdd");
	const archived = existsSync(done) ? readdirSync(done).filter((f) => /^office-previews-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort() : [];
	return archived.length > 0 ? join(done, archived[archived.length - 1]) : active;
}
const REPORT_PATH = sddPath();

function experimentSection(report: string): string[] | null {
	const lines = report.split("\n");
	const start = lines.findIndex((l) => l.trim() === "### Format Experiment");
	if (start < 0) return null;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((l) => /^#{1,3}\s/.test(l));
	return end < 0 ? rest : rest.slice(0, end);
}

describe("SDD office-previews p1 c18", () => {
	it("keeps SUPPORTED_EXTENSIONS unchanged", () => {
		expect([...SUPPORTED_EXTENSIONS]).toEqual(EXPECTED);
	});

	it("records exactly one pass/fail/no sample row per extension in the report", () => {
		expect(existsSync(REPORT_PATH)).toBe(true);
		const section = experimentSection(readFileSync(REPORT_PATH, "utf8"));
		expect(section).not.toBeNull();

		const rows = (section ?? [])
			.filter((l) => l.trim().startsWith("|"))
			.map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));

		for (const ext of EXPECTED) {
			const matching = rows.filter((cells) => cells[0] === `\`${ext}\``);
			expect(matching, `rows for ${ext}`).toHaveLength(1);
			expect(ALLOWED, `result for ${ext}`).toContain(matching[0][1]);
		}
	});
});
