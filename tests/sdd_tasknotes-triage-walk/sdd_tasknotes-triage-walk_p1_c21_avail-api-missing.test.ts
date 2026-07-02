import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { createTaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";

describe("createTaskNotesBridge availability", () => {
	it("returns api-missing when the TaskNotes plugin has no .api", () => {
		const app = { plugins: { getPlugin: (_id: string) => ({}) } } as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({ ok: false, reason: "api-missing" });
	});
});
