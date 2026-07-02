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

describe("selectTriageTasks — recurring task skipped-today exclusion", () => {
	it("excludes a recurring task scheduled today with today in skippedInstances", () => {
		const task = makeTask({
			isRecurring: true,
			scheduled: "2026-07-02",
			skippedInstances: ["2026-07-02"],
		});

		const result = selectTriageTasks([task], today);

		expect(result).toEqual([]);
	});
});
