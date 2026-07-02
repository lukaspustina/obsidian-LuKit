import { describe, it, expect } from "vitest";
import { rescheduleReminderLine } from "../../src/features/work-diary/work-diary-engine";

const CONTENT = `---
tags: []
---

# Erinnerungen

- Zahnarzt anrufen

---
`;

describe("rescheduleReminderLine", () => {
	it("appends a date suffix to a dateless reminder line", () => {
		const result = rescheduleReminderLine(CONTENT, "- Zahnarzt anrufen", new Date(2026, 6, 3), "de");

		expect(result).not.toBeNull();
		expect(result?.newContent).toContain("- Zahnarzt anrufen, 03.07.2026");
		expect(result?.newContent).not.toContain("- Zahnarzt anrufen\n");
	});
});
