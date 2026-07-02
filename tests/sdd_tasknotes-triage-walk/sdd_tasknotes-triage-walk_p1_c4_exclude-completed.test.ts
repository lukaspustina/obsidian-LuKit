import { describe, it, expect } from "vitest";
import { selectTriageTasks, TriageTask } from "../../src/features/task-triage/task-triage-engine";

const today = "2026-07-02";

function makeTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "Tasks/task.md",
		title: "Max Mustermann anrufen",
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

describe("selectTriageTasks — completed non-recurring task exclusion", () => {
	it("excludes a completed non-recurring task with due yesterday", () => {
		const task = makeTask({
			isCompleted: true,
			isRecurring: false,
			due: "2026-07-01",
		});

		const result = selectTriageTasks([task], today);

		expect(result).toEqual([]);
	});
});
