import { describe, it, expect } from "vitest";
import { selectTriageTasks, TriageTask } from "../../src/features/task-triage/task-triage-engine";

const TODAY = "2026-07-02";

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

describe("selectTriageTasks — OR semantics across due/scheduled", () => {
	it("includes a task with scheduled = today and due next week", () => {
		const task = makeTask({ scheduled: TODAY, due: "2026-07-09" });

		const result = selectTriageTasks([task], TODAY);

		expect(result).toContainEqual(task);
	});
});
