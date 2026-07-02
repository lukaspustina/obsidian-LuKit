import { describe, it, expect } from "vitest";
import { listReminders } from "../../src/features/work-diary/work-diary-engine";
import { selectDueReminders } from "../../src/features/task-triage/task-triage-engine";

describe("selectDueReminders ordering (SDD erinnerungen-triage p1 c1)", () => {
	it("selects the overdue and dateless reminders, skips the future one, in document order", () => {
		const content = [
			"---",
			"tags: []",
			"---",
			"",
			"# Erinnerungen",
			"",
			"- Zahnarzt anrufen, 01.07.2026",
			"- Angebot an Max Mustermann senden, 03.07.2026",
			"- Acme Rechnung prüfen",
			"",
			"---",
			"",
			"##### Mi, 01.07.2026",
			"- Eintrag",
		].join("\n");

		const items = listReminders(content, "de");
		const due = selectDueReminders(items, "2026-07-02");

		expect(due).toHaveLength(2);
		expect(due[0].text).toBe("Zahnarzt anrufen");
		expect(due[1].text).toBe("Acme Rechnung prüfen");

		expect(due.some((item) => item.text === "Angebot an Max Mustermann senden")).toBe(false);

		expect(due[0].date).not.toBeNull();
		expect(due[0].date?.getFullYear()).toBe(2026);
		expect(due[0].date?.getMonth()).toBe(6);
		expect(due[0].date?.getDate()).toBe(1);

		expect(due[1].date).toBeNull();
	});
});
