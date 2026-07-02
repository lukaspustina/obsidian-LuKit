import { describe, it, expect } from "vitest";
import { overdueLabel, type TriageTask } from "../../src/features/task-triage/task-triage-engine";
import type { DateLocale } from "../../src/shared/date-format";

const TODAY = "2026-07-02";
const LOCALE: DateLocale = "de";

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

describe("overdueLabel - not overdue", () => {
	it("returns an empty string when due is today", () => {
		const task = makeTask({ due: TODAY });

		const result = overdueLabel(task, TODAY, LOCALE);

		expect(result).toBe("");
	});

	it("returns an empty string when the task has no dates at all", () => {
		const task = makeTask();

		const result = overdueLabel(task, TODAY, LOCALE);

		expect(result).toBe("");
	});
});
