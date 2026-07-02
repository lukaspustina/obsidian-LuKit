import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { createTaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";

describe("createTaskNotesBridge availability", () => {
	it("returns api-version-mismatch when the TaskNotes api exposes a non-1 apiVersion", () => {
		const app = {
			plugins: {
				getPlugin: (_id: string) => ({
					api: { apiVersion: 2, hasCapability: () => true },
				}),
			},
		} as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({ ok: false, reason: "api-version-mismatch" });
	});
});
