import { describe, it, expect } from "vitest";
import { formatProjectLink } from "../../src/features/task-triage/task-triage-engine";

describe("formatProjectLink", () => {
	it("prefers the alias when present", () => {
		const result = formatProjectLink("[[Vorgang - Acme Bestellung|Acme]]");

		expect(result).toBe("Acme");
	});

	it("returns the target when no alias is present", () => {
		const result = formatProjectLink("[[Vorgang - Acme Bestellung]]");

		expect(result).toBe("Vorgang - Acme Bestellung");
	});

	it("returns a non-wikilink string unmodified", () => {
		const result = formatProjectLink("Freitext-Projekt");

		expect(result).toBe("Freitext-Projekt");
	});
});
