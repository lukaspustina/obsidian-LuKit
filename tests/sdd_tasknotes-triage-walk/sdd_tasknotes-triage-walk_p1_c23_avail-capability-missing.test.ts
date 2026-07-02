import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { createTaskNotesBridge } from "../../src/features/task-triage/tasknotes-bridge";

describe("createTaskNotesBridge availability", () => {
	it("returns capability-missing naming recurring.write when hasCapability rejects it", () => {
		const app = {
			plugins: {
				getPlugin: (_id: string) => ({
					api: {
						apiVersion: 1,
						hasCapability: (id: string) => id !== "recurring.write",
					},
				}),
			},
		} as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({
			ok: false,
			reason: "capability-missing",
			capability: "recurring.write",
		});
	});

	it("returns capability-missing naming tasks.write when hasCapability rejects it", () => {
		const app = {
			plugins: {
				getPlugin: (_id: string) => ({
					api: {
						apiVersion: 1,
						hasCapability: (id: string) => id !== "tasks.write",
					},
				}),
			},
		} as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({
			ok: false,
			reason: "capability-missing",
			capability: "tasks.write",
		});
	});

	it("returns capability-missing naming catalog.read when hasCapability rejects it", () => {
		const app = {
			plugins: {
				getPlugin: (_id: string) => ({
					api: {
						apiVersion: 1,
						hasCapability: (id: string) => id !== "catalog.read",
					},
				}),
			},
		} as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({
			ok: false,
			reason: "capability-missing",
			capability: "catalog.read",
		});
	});

	it("returns ok:true when all required capabilities are present", () => {
		const app = {
			plugins: {
				getPlugin: (_id: string) => ({
					api: { apiVersion: 1, hasCapability: () => true },
				}),
			},
		} as unknown as App;

		const result = createTaskNotesBridge(app).availability();

		expect(result).toEqual({ ok: true });
	});
});
