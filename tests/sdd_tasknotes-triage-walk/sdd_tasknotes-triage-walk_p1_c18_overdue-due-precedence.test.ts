import { describe, it, expect } from "vitest";
import { overdueLabel, TriageTask } from "../../src/features/task-triage/task-triage-engine";
import { DateLocale } from "../../src/shared/date-format";

function makeTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "Tasks/task.md",
		title: "Sample task",
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

describe("overdueLabel — due/scheduled precedence", () => {
	it("uses due (not scheduled) when both are overdue, with de wording", () => {
		const today = "2026-07-02";
		const task = makeTask({
			due: "2026-06-27", // 5 days before today
			scheduled: "2026-06-30", // 2 days before today
		});

		const locale: DateLocale = "de";
		const result = overdueLabel(task, today, locale);

		expect(result).toBe("5d überfällig");
		expect(result).not.toContain("2d");
	});
});
