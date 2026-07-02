import { describe, it, expect } from "vitest";
import { selectTriageTasks, TriageTask } from "../../src/features/task-triage/task-triage-engine";

const today = "2026-07-02";

function makeTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "Tasks/Task.md",
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

describe("selectTriageTasks", () => {
	it("excludes a task with both due and scheduled in the future", () => {
		const task = makeTask({ due: "2026-07-10", scheduled: "2026-07-05" });

		const result = selectTriageTasks([task], today);

		expect(result).toEqual([]);
	});
});
