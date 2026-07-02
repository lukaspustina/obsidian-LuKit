import { describe, it, expect } from "vitest";
import { selectTriageTasks, TriageTask } from "../../src/features/task-triage/task-triage-engine";

const today = "2026-07-02";

function makeTask(overrides: Partial<TriageTask>): TriageTask {
	return {
		path: "path.md",
		title: "Task",
		isCompleted: false,
		contexts: [],
		projects: [],
		isRecurring: false,
		completeInstances: [],
		skippedInstances: [],
		...overrides,
	};
}

describe("selectTriageTasks sort order", () => {
	it("orders by scheduled ascending, then due ascending, with missing dates sorting last within each key", () => {
		const tasks: TriageTask[] = [
			makeTask({ path: "a.md", scheduled: "2026-06-30" }),
			makeTask({ path: "b.md", scheduled: "2026-07-01" }),
			makeTask({ path: "c.md", due: "2026-06-25" }),
			makeTask({ path: "d.md", due: "2026-06-28" }),
			makeTask({ path: "e.md", scheduled: "2026-06-30", due: "2026-06-20" }),
		];

		const result = selectTriageTasks(tasks, today);

		expect(result.map((t) => t.path)).toEqual([
			"e.md",
			"a.md",
			"b.md",
			"c.md",
			"d.md",
		]);
	});
});
