import { describe, it, expect } from "vitest";
import { listReminders } from "../../src/features/work-diary/work-diary-engine";

const CONTENT = `---
tags: []
---

# Erinnerungen

- Angebot prüfen, verhandeln, 01.07.2026

---
`;

describe("listReminders", () => {
	it("keeps a comma in the reminder text and parses the trailing date (locale de)", () => {
		const result = listReminders(CONTENT, "de");

		expect(result).toHaveLength(1);
		const [item] = result;
		expect(item.text).toBe("Angebot prüfen, verhandeln");
		expect(item.date).not.toBeNull();
		expect(item.date?.getFullYear()).toBe(2026);
		expect(item.date?.getMonth()).toBe(6);
		expect(item.date?.getDate()).toBe(1);
		expect(item.line).toBe("- Angebot prüfen, verhandeln, 01.07.2026");
	});
});
