import { TFile } from "obsidian";
import type { App } from "obsidian";
import type { TriageTask } from "./task-triage-engine";

export type BridgeAvailability =
	| { ok: true }
	| { ok: false; reason: "plugin-missing" | "api-missing" | "api-version-mismatch" }
	| { ok: false; reason: "capability-missing"; capability: string };

export interface TaskNotesBridge {
	availability(): BridgeAvailability;
	listTasks(): Promise<TriageTask[]>;
	complete(path: string): Promise<void>;
	setScheduled(path: string, date: string): Promise<void>;
	toggleCompleteInstance(path: string, date: string): Promise<void>;
	toggleSkippedInstance(path: string, date: string): Promise<void>;
	readNote(path: string): Promise<string>;
	openInNewTab(path: string): Promise<void>;
}

// Minimal local mirror of the TaskNotes runtime API (apiVersion 1). TaskInfo has
// no boolean completed field — isCompleted is derived via catalog.statuses().
interface StatusConfig {
	value: string;
	isCompleted: boolean;
}

interface TaskInfo {
	path: string;
	title: string;
	status: string;
	due?: string;
	scheduled?: string;
	priority?: string;
	contexts?: string[];
	projects?: string[];
	recurrence?: string;
	complete_instances?: string[];
	skipped_instances?: string[];
}

interface TaskNotesApi {
	apiVersion: number;
	hasCapability(id: string): boolean;
	tasks: {
		get(path: string): Promise<TaskInfo | null>;
		list(): Promise<TaskInfo[]>;
		complete(path: string): Promise<void>;
		setScheduled(path: string, date: string): Promise<void>;
	};
	recurring: {
		toggleCompleteInstance(path: string, date: string): Promise<void>;
		toggleSkippedInstance(path: string, date: string): Promise<void>;
	};
	catalog: {
		statuses(): StatusConfig[];
	};
}

// Unofficial fast path: TaskNotes' internal TaskManager keeps a synchronous
// filter index of task paths. The official api.tasks.list() instead walks
// EVERY markdown file in the vault and falls back to a disk read for each
// note without cached frontmatter — 20-30s on a large vault. We probe the
// internal index defensively and fall back to list() if its shape changes.
interface TaskNotesInternalCacheManager {
	getAllTaskPaths?(): Set<string>;
}

interface TaskNotesPluginInstance {
	api?: TaskNotesApi;
	cacheManager?: TaskNotesInternalCacheManager;
}

interface PluginsAccessor {
	getPlugin(id: string): TaskNotesPluginInstance | null;
}

interface AppWithPlugins {
	plugins: PluginsAccessor;
}

const REQUIRED_CAPABILITIES = ["tasks.read", "tasks.write", "recurring.write"] as const;

export function createTaskNotesBridge(app: App): TaskNotesBridge {
	function getApi(): TaskNotesApi | undefined {
		const plugins = (app as unknown as AppWithPlugins).plugins;
		const plugin = plugins.getPlugin("tasknotes");
		return plugin?.api;
	}

	function requireApi(): TaskNotesApi {
		const api = getApi();
		if (api === undefined) {
			throw new Error("tasknotes-api-unavailable");
		}
		return api;
	}

	function resolveFile(path: string): TFile {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			throw new Error("tasknotes-file-not-found");
		}
		return file;
	}

	function internalTaskPaths(): string[] | null {
		const plugins = (app as unknown as AppWithPlugins).plugins;
		const cache = plugins.getPlugin("tasknotes")?.cacheManager;
		if (cache === undefined || typeof cache.getAllTaskPaths !== "function") {
			return null;
		}
		try {
			return Array.from(cache.getAllTaskPaths());
		} catch {
			return null;
		}
	}

	async function fetchTaskInfos(api: TaskNotesApi): Promise<TaskInfo[]> {
		const started = Date.now();
		const paths = internalTaskPaths();
		if (paths === null) {
			const infos = await api.tasks.list();
			console.log(`LuKit task-triage: listTasks fallback list() tasks=${infos.length} ms=${Date.now() - started}`);
			return infos;
		}
		const infos = await Promise.all(paths.map((p) => api.tasks.get(p)));
		const found = infos.filter((info): info is TaskInfo => info !== null);
		console.log(`LuKit task-triage: listTasks fast-path paths=${paths.length} tasks=${found.length} ms=${Date.now() - started}`);
		return found;
	}

	return {
		availability(): BridgeAvailability {
			const plugins = (app as unknown as AppWithPlugins).plugins;
			const plugin = plugins.getPlugin("tasknotes");
			if (plugin === null) {
				return { ok: false, reason: "plugin-missing" };
			}

			const api = plugin.api;
			if (api === undefined) {
				return { ok: false, reason: "api-missing" };
			}

			if (api.apiVersion !== 1) {
				return { ok: false, reason: "api-version-mismatch" };
			}

			for (const capability of REQUIRED_CAPABILITIES) {
				if (!api.hasCapability(capability)) {
					return { ok: false, reason: "capability-missing", capability };
				}
			}

			return { ok: true };
		},

		async listTasks(): Promise<TriageTask[]> {
			const api = requireApi();
			const infos = await fetchTaskInfos(api);
			const statuses = api.catalog.statuses();

			return infos.map((task) => ({
				path: task.path,
				title: task.title,
				isCompleted: statuses.find((s) => s.value === task.status)?.isCompleted ?? false,
				due: task.due,
				scheduled: task.scheduled,
				priority: task.priority,
				contexts: task.contexts ?? [],
				projects: task.projects ?? [],
				isRecurring: !!task.recurrence,
				completeInstances: task.complete_instances ?? [],
				skippedInstances: task.skipped_instances ?? [],
			}));
		},

		async complete(path: string): Promise<void> {
			await requireApi().tasks.complete(path);
		},

		async setScheduled(path: string, date: string): Promise<void> {
			await requireApi().tasks.setScheduled(path, date);
		},

		async toggleCompleteInstance(path: string, date: string): Promise<void> {
			await requireApi().recurring.toggleCompleteInstance(path, date);
		},

		async toggleSkippedInstance(path: string, date: string): Promise<void> {
			await requireApi().recurring.toggleSkippedInstance(path, date);
		},

		async readNote(path: string): Promise<string> {
			return app.vault.read(resolveFile(path));
		},

		async openInNewTab(path: string): Promise<void> {
			const file = resolveFile(path);
			await app.workspace.getLeaf("tab").openFile(file);
		},
	};
}
