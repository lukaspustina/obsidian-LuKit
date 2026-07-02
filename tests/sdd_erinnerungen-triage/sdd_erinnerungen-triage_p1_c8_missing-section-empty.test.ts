import { describe, it, expect } from "vitest";
import { listReminders } from "../../src/features/work-diary/work-diary-engine";

const NO_ERINNERUNGEN_SECTION = `---
tags: []
---

---

##### Mi, 01.07.2026
- Eintrag
`;

const NO_THIRD_SEPARATOR = `---
tags: []
---

# Erinnerungen

- Zahnarzt anrufen, 01.07.2026
`;

describe("listReminders", () => {
	it("returns an empty array when there is no # Erinnerungen section", () => {
		expect(() => listReminders(NO_ERINNERUNGEN_SECTION, "de")).not.toThrow();
		expect(listReminders(NO_ERINNERUNGEN_SECTION, "de")).toEqual([]);
	});

	it("returns an empty array when there is no third --- separator", () => {
		expect(() => listReminders(NO_THIRD_SEPARATOR, "de")).not.toThrow();
		expect(listReminders(NO_THIRD_SEPARATOR, "de")).toEqual([]);
	});
});
