import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
	mkdtempSync,
	writeFileSync,
	readFileSync,
	rmSync,
	existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
	formatTextEntry,
	formatDiaryEntry,
	addEntryUnderToday,
	ensureTodayHeader,
	formatReminderEntry,
	addReminder,
} from "../../src/features/work-diary/work-diary-engine";

const friday = new Date(2026, 1, 6);

// __CLI_VERSION__ is replaced by esbuild at CLI build time. When running
// under vitest, polyfill it so the --version test sees a stable value.
beforeAll(() => {
	(globalThis as Record<string, unknown>).__CLI_VERSION__ = "1.12.4";
});

interface CliCapture {
	stdout: string;
	stderr: string;
	exitCode: number;
}

class ExitError extends Error {
	constructor(public code: number) { super(`exit ${code}`); }
}

async function runCliCapture(argv: string[], homeDir?: string): Promise<CliCapture> {
	const out: string[] = [];
	const err: string[] = [];
	const originalHome = process.env.HOME;
	if (homeDir !== undefined) process.env.HOME = homeDir;
	const { runCli } = await import("../../src/cli");
	let exitCode = 0;
	try {
		runCli(argv, {
			out: (s) => out.push(s),
			err: (s) => err.push(s),
			exit: (code) => { throw new ExitError(code); },
		});
	} catch (e) {
		if (e instanceof ExitError) exitCode = e.code;
		else throw e;
	} finally {
		if (homeDir !== undefined) {
			if (originalHome === undefined) delete process.env.HOME;
			else process.env.HOME = originalHome;
		}
	}
	return { stdout: out.join(""), stderr: err.join(""), exitCode };
}

describe("CLI: add-text-to-diary", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("adds a text entry to a diary file", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatTextEntry("reviewed the budget");
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("- reviewed the budget");
	});

	it("creates header if missing then adds text", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatTextEntry("new task");
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("##### Fr, 06.02.2026");
		expect(result).toContain("- new task");
	});
});

describe("CLI: ensure-today-header", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("ensures today's header is present", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const { newContent } = ensureTodayHeader(content, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("##### Fr, 06.02.2026");
		expect(result).toContain("##### Do, 05.02.2026");
	});

	it("is idempotent — running twice does not duplicate header", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Do, 05.02.2026\n- old";
		writeFileSync(diaryPath, initial, "utf-8");

		const content1 = readFileSync(diaryPath, "utf-8");
		const { newContent: pass1 } = ensureTodayHeader(content1, "de", friday);
		writeFileSync(diaryPath, pass1, "utf-8");

		const content2 = readFileSync(diaryPath, "utf-8");
		const { newContent: pass2 } = ensureTodayHeader(content2, "de", friday);
		writeFileSync(diaryPath, pass2, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		const headerCount = result.split("##### Fr, 06.02.2026").length - 1;
		expect(headerCount).toBe(1);
	});

	it("warns on fallback when third separator is missing", () => {
		const initial = "---\nfm\n---\nsome content";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const { newContent, fallback } = ensureTodayHeader(content, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		expect(fallback).toBe(true);
		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("##### Fr, 06.02.2026");
	});
});

describe("CLI: add-diary-entry", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("adds a linked entry with heading", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatDiaryEntry("ProjectX", "Tasks");
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("- [[ProjectX#Tasks|ProjectX: Tasks]]");
	});

	it("adds a linked entry without heading", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatDiaryEntry("MeetingNotes", null);
		const { newContent } = addEntryUnderToday(content, entry, "de", friday);
		writeFileSync(diaryPath, newContent, "utf-8");

		const result = readFileSync(diaryPath, "utf-8");
		expect(result).toContain("- [[MeetingNotes]]");
	});
});

describe("CLI: add-reminder", () => {
	let tmpDir: string;
	let diaryPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
		diaryPath = join(tmpDir, "diary.md");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("adds a reminder to a diary file", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry("Call dentist", "de", friday);
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		writeFileSync(diaryPath, result!.newContent, "utf-8");

		const written = readFileSync(diaryPath, "utf-8");
		expect(written).toContain("# Erinnerungen");
		expect(written).toContain("- Call dentist, 06.02.2026");
		expect(written).toContain("##### Fr, 06.02.2026");
	});

	it("adds newest reminder at top of existing section", () => {
		const initial = "---\nfm\n---\n[[pinned]]\n\n# Erinnerungen\n- Old, 05.02.2026\n\n---\n##### Fr, 06.02.2026";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry("New thought", "de", friday);
		const result = addReminder(content, entry);
		expect(result).not.toBeNull();
		writeFileSync(diaryPath, result!.newContent, "utf-8");

		const written = readFileSync(diaryPath, "utf-8");
		const lines = written.split("\n");
		const headingIdx = lines.indexOf("# Erinnerungen");
		expect(lines[headingIdx + 1]).toBe("- New thought, 06.02.2026");
		expect(lines[headingIdx + 2]).toBe("- Old, 05.02.2026");
	});

	it("returns null when third separator is missing", () => {
		const initial = "---\nfm\n---\nno third separator";
		writeFileSync(diaryPath, initial, "utf-8");

		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry("reminder", "de", friday);
		const result = addReminder(content, entry);
		expect(result).toBeNull();
	});
});

describe("CLI: argument parsing", () => {
	it("unknown command exits with non-zero code", async () => {
		const { exitCode } = await runCliCapture(["unknown-command"]);
		expect(exitCode).not.toBe(0);
	});

	it("add-text-to-diary with missing args exits with non-zero code", async () => {
		const { exitCode } = await runCliCapture(["add-text-to-diary"]);
		expect(exitCode).not.toBe(0);
	});

	it("rejects extra positional args with exit code 2", async () => {
		const { exitCode, stderr } = await runCliCapture(["add-text-to-diary", "diary.md", "hello", "extra"]);
		expect(exitCode).toBe(2);
		expect(stderr).toContain("extra args");
	});

	it("rejects empty note-name with exit code 2 and stderr message", async () => {
		const { exitCode, stderr } = await runCliCapture(["add-diary-entry", "diary.md", ""]);
		expect(exitCode).toBe(2);
		expect(stderr).toContain("note-name must not be empty");
	});

	it("--help prints global usage and exits 0", async () => {
		const { exitCode, stdout } = await runCliCapture(["--help"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Usage: lukit");
		expect(stdout).toContain("Commands:");
	});

	it("<command> --help prints per-command usage and exits 0", async () => {
		const { exitCode, stdout } = await runCliCapture(["add-diary-entry", "--help"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("add-diary-entry");
		expect(stdout).toContain("<note-name>");
	});

	it("--version prints the build-time version and exits 0", async () => {
		const { exitCode, stdout } = await runCliCapture(["--version"]);
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

describe("CLI: init-config", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "lukit-cli-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true });
	});

	it("creates config file with expected keys", async () => {
		const { exitCode, stdout } = await runCliCapture(["init-config"], tmpDir);
		expect(exitCode).toBe(0);
		const configPath = join(tmpDir, ".lukit.json");

		expect(existsSync(configPath)).toBe(true);
		const config = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(config).toHaveProperty("diaryPath");
		expect(config).toHaveProperty("dateLocale");
		expect(config).toHaveProperty("cliPath");
		expect(config).toHaveProperty("nodePath");
		expect(config.dateLocale).toBe("de");
		expect(stdout).toContain("Created");
	});

	it("refuses to overwrite existing config", async () => {
		const configPath = join(tmpDir, ".lukit.json");
		writeFileSync(configPath, "{}", "utf-8");

		const { exitCode, stderr } = await runCliCapture(["init-config"], tmpDir);
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain("already exists");
		const content = readFileSync(configPath, "utf-8");
		expect(content).toBe("{}");
	});
});
