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

describe("overdueLabel - scheduled fallback when due does not qualify", () => {
	it("returns a string containing '2d überfällig' based on scheduled when due is in the future", () => {
		const task = makeTask({ scheduled: "2026-06-30", due: "2026-07-10" });
		const locale: DateLocale = "de";

		const result = overdueLabel(task, TODAY, locale);

		expect(result).toContain("2d überfällig");
	});
});
