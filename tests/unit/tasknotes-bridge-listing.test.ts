import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { createTaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";

interface RawTaskInfo {
	path: string;
	title: string;
	status: string;
	due?: string;
	scheduled?: string;
}

function makeApi(tasks: RawTaskInfo[]) {
	const byPath = new Map(tasks.map((t) => [t.path, t]));
	return {
		apiVersion: 1,
		hasCapability: () => true,
		tasks: {
			get: vi.fn(async (path: string) => byPath.get(path) ?? null),
			list: vi.fn(async () => tasks),
			complete: vi.fn(async () => undefined),
			setScheduled: vi.fn(async () => undefined),
		},
		recurring: {
			toggleCompleteInstance: vi.fn(async () => undefined),
			toggleSkippedInstance: vi.fn(async () => undefined),
		},
		catalog: {
			statuses: () => [{ value: "done", isCompleted: true }],
		},
	};
}

function makeApp(plugin: unknown): App {
	return { plugins: { getPlugin: () => plugin } } as unknown as App;
}

const TASKS: RawTaskInfo[] = [
	{ path: "TaskNotes/Tasks/A.md", title: "Kosten prüfen", status: "open", due: "2026-07-01" },
	{ path: "TaskNotes/Tasks/B.md", title: "Rechnung senden", status: "done" },
];

describe("tasknotes-bridge listTasks — indexed fast path", () => {
	it("uses cacheManager.getAllTaskPaths + tasks.get and never calls tasks.list", async () => {
		const api = makeApi(TASKS);
		const app = makeApp({
			api,
			cacheManager: { getAllTaskPaths: () => new Set(TASKS.map((t) => t.path)) },
		});

		const result = await createTaskNotesBridge(app).listTasks();

		expect(api.tasks.list).not.toHaveBeenCalled();
		expect(api.tasks.get).toHaveBeenCalledTimes(2);
		expect(result.map((t) => t.path).sort()).toEqual(["TaskNotes/Tasks/A.md", "TaskNotes/Tasks/B.md"]);
		expect(result.find((t) => t.path === "TaskNotes/Tasks/B.md")?.isCompleted).toBe(true);
	});

	it("drops paths that tasks.get resolves to null", async () => {
		const api = makeApi(TASKS);
		const app = makeApp({
			api,
			cacheManager: { getAllTaskPaths: () => new Set([...TASKS.map((t) => t.path), "gone.md"]) },
		});

		const result = await createTaskNotesBridge(app).listTasks();

		expect(result).toHaveLength(2);
	});

	it("falls back to tasks.list when the internal index is missing", async () => {
		const api = makeApi(TASKS);
		const app = makeApp({ api });

		const result = await createTaskNotesBridge(app).listTasks();

		expect(api.tasks.list).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(2);
	});

	it("skips paths whose tasks.get rejects instead of failing the whole listing", async () => {
		const api = makeApi(TASKS);
		api.tasks.get.mockImplementation(async (path: string) => {
			if (path === "TaskNotes/Tasks/A.md") throw new Error("stale index entry");
			return TASKS.find((t) => t.path === path) ?? null;
		});
		const app = makeApp({
			api,
			cacheManager: { getAllTaskPaths: () => new Set(TASKS.map((t) => t.path)) },
		});

		const result = await createTaskNotesBridge(app).listTasks();

		expect(api.tasks.list).not.toHaveBeenCalled();
		expect(result.map((t) => t.path)).toEqual(["TaskNotes/Tasks/B.md"]);
	});

	it("falls back to tasks.list when getAllTaskPaths throws", async () => {
		const api = makeApi(TASKS);
		const app = makeApp({
			api,
			cacheManager: {
				getAllTaskPaths: () => {
					throw new Error("index");
				},
			},
		});

		const result = await createTaskNotesBridge(app).listTasks();

		expect(api.tasks.list).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(2);
	});
});

describe("tasknotes-bridge listTasks — date normalization", () => {
	it("truncates datetime due/scheduled values to YYYY-MM-DD", async () => {
		const tasks: RawTaskInfo[] = [
			{ path: "TaskNotes/Tasks/C.md", title: "Termin vorbereiten", status: "open", due: "2026-07-02T14:30", scheduled: "2026-07-01T09:00" },
		];
		const api = makeApi(tasks);
		const app = makeApp({ api });

		const result = await createTaskNotesBridge(app).listTasks();

		expect(result[0].due).toBe("2026-07-02");
		expect(result[0].scheduled).toBe("2026-07-01");
	});

	it("drops non-date due/scheduled values instead of passing garbage to the engine", async () => {
		const tasks: RawTaskInfo[] = [
			{ path: "TaskNotes/Tasks/D.md", title: "Unterlagen sichten", status: "open", due: "bald", scheduled: "2026-07-01" },
		];
		const api = makeApi(tasks);
		const app = makeApp({ api });

		const result = await createTaskNotesBridge(app).listTasks();

		expect(result[0].due).toBeUndefined();
		expect(result[0].scheduled).toBe("2026-07-01");
	});
});
