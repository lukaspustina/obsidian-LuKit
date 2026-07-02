import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { createTaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";

describe("createTaskNotesBridge availability", () => {
	it("returns plugin-missing when TaskNotes is not installed", () => {
		const app = { plugins: { getPlugin: (_id: string) => null } } as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({ ok: false, reason: "plugin-missing" });
	});
});
