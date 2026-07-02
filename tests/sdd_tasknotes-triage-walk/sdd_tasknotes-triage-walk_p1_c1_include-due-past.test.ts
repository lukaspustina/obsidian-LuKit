import { describe, it, expect } from "vitest";
import { selectTriageTasks, type TriageTask } from "../../src/features/task-triage/task-triage-engine";

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

describe("selectTriageTasks", () => {
	it("includes a non-completed task with a due date in the past", () => {
		const task = makeTask({ due: "2026-07-01", isCompleted: false });

		const result = selectTriageTasks([task], TODAY);

		expect(result).toContainEqual(task);
	});
});
