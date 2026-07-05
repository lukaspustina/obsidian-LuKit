import { describe, it, expect, vi, afterEach } from "vitest";
import { TFile } from "../helpers/obsidian-stub";
import { createSectionNoteViaCommand } from "../../src/shared/quick-create";

type Handler = (file: TFile) => void;

// Minimaler Fake rund um die Event-/Command-Oberfläche, die der Helfer nutzt.
function fakeApp(executeResult = true) {
	const handlers: { create: Handler[]; changed: Handler[] } = { create: [], changed: [] };
	const fm = new Map<string, Record<string, unknown>>();
	const offrefs: unknown[] = [];
	const app = {
		vault: {
			on: (name: "create", h: Handler) => {
				handlers.create.push(h);
				return { name };
			},
			offref: (ref: unknown) => {
				offrefs.push(ref);
			},
		},
		metadataCache: {
			on: (name: "changed", h: Handler) => {
				handlers.changed.push(h);
				return { name };
			},
			offref: (ref: unknown) => {
				offrefs.push(ref);
			},
			getFileCache: (file: TFile) => {
				const f = fm.get(file.path);
				return f ? { frontmatter: f } : null;
			},
		},
		commands: { executeCommandById: () => executeResult },
	};
	return { app: app as never, handlers, fm, offrefs };
}

function mdFile(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = path.replace(/^.*\//, "").replace(/\.md$/, "");
	return f;
}

afterEach(() => {
	vi.useRealTimers();
});

describe("createSectionNoteViaCommand", () => {
	it("resolves the created note once its section tag is indexed", async () => {
		const { app, handlers, fm } = fakeApp();
		const promise = createSectionNoteViaCommand(app, "quickadd:choice:x");

		const file = mdFile("Vorgänge/Vorgang - Neu.md");
		handlers.create.forEach((h) => h(file));
		fm.set(file.path, { tags: ["Vorgang"] });
		handlers.changed.forEach((h) => h(file));

		await expect(promise).resolves.toBe(file);
	});

	it("resolves null immediately when the command id does not exist", async () => {
		const { app } = fakeApp(false);
		await expect(createSectionNoteViaCommand(app, "gibt-es-nicht")).resolves.toBeNull();
	});

	it("resolves on timeout with whatever was created (or null) and unsubscribes", async () => {
		vi.useFakeTimers();
		const { app, handlers, offrefs } = fakeApp();
		const promise = createSectionNoteViaCommand(app, "quickadd:choice:x", 1000);

		const file = mdFile("Vorgänge/Vorgang - Halb.md");
		handlers.create.forEach((h) => h(file)); // erstellt, aber nie indexiert
		vi.advanceTimersByTime(1001);

		await expect(promise).resolves.toBe(file);
		expect(offrefs).toHaveLength(2);
	});
});
