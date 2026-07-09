import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("SDD email-attachment-selection p1 c14", () => {
	it("no .ts file under src/features/email-filing/ contains the old attachmentsLine field", () => {
		const dir = path.resolve(__dirname, "../../src/features/email-filing");
		const tsFiles = fs.readdirSync(dir).filter((name) => name.endsWith(".ts"));

		const offenders = tsFiles.filter((name) => {
			const content = fs.readFileSync(path.join(dir, name), "utf-8");
			return content.includes("attachmentsLine");
		});

		expect(offenders).toEqual([]);
	});
});
