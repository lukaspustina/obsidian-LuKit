import { describe, it, expect } from "vitest";
import { overdueLabel, type TriageTask } from "../../src/features/task-triage/task-triage-engine";
import type { DateLocale } from "../../src/shared/date-format";

const TODAY = "2026-07-02";

function makeTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "Tasks/Max Mustermann.md",
		title: "Call Max Mustermann at Acme",
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

describe("overdueLabel - en/iso locale", () => {
	it("returns a string containing '3d overdue' for a task 3 days overdue on due (en)", () => {
		const task = makeTask({ due: "2026-06-29" });
		const locale: DateLocale = "en";

		const result = overdueLabel(task, TODAY, locale);

		expect(result).toContain("3d overdue");
	});

	it("returns a string containing '3d overdue' for a task 3 days overdue on due (iso)", () => {
		const task = makeTask({ due: "2026-06-29" });
		const locale: DateLocale = "iso";

		const result = overdueLabel(task, TODAY, locale);

		expect(result).toContain("3d overdue");
	});
});
