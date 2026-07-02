import { describe, it, expect } from "vitest";
import { selectTriageTasks, type TriageTask } from "../../src/features/task-triage/task-triage-engine";

const TODAY = "2026-07-02";

function buildTask(overrides: Partial<TriageTask> = {}): TriageTask {
	return {
		path: "Tasks/Task.md",
		title: "Wasser die Pflanzen giessen",
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

describe("selectTriageTasks — recurring task with completed-looking raw status", () => {
	it("includes a recurring task scheduled today with empty completeInstances/skippedInstances despite isCompleted: true", () => {
		const task = buildTask({
			path: "Tasks/Muell-rausbringen.md",
			title: "Müll rausbringen",
			scheduled: TODAY,
			isRecurring: true,
			isCompleted: true,
			completeInstances: [],
			skippedInstances: [],
		});

		const result = selectTriageTasks([task], TODAY);

		expect(result).toContainEqual(task);
		expect(result).toHaveLength(1);
	});
});
