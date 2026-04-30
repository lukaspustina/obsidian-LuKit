import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import {
	formatTextEntry,
	formatDiaryEntry,
	addEntryUnderToday,
	ensureTodayHeader,
	formatReminderEntry,
	addReminder,
} from "./features/work-diary/work-diary-engine";
import { isDateLocale } from "./shared/date-format";
import type { DateLocale } from "./shared/date-format";

declare const __CLI_VERSION__: string;

// Side-effect surface, parameterised so tests can run main() in-process
// without spawning subprocesses or terminating the test runner.
export interface CliIO {
	out: (s: string) => void;   // stdout writer; callers add their own newlines
	err: (s: string) => void;   // stderr writer; callers add their own newlines
	exit: (code: number) => never;  // must not return
}

interface CommandSpec {
	handler: (args: string[], io: CliIO) => void;
	usage: string;
	expectedPositional: number;
	maxPositional?: number;
}

const commands: Record<string, CommandSpec> = {
	"add-text-to-diary": {
		handler: runAddTextToDiary,
		usage: "lukit add-text-to-diary <diary-path> <text>",
		expectedPositional: 2,
	},
	"ensure-today-header": {
		handler: runEnsureTodayHeader,
		usage: "lukit ensure-today-header <diary-path>",
		expectedPositional: 1,
	},
	"add-diary-entry": {
		handler: runAddDiaryEntry,
		usage: "lukit add-diary-entry <diary-path> <note-name> [heading]",
		expectedPositional: 2,
		maxPositional: 3,
	},
	"add-reminder": {
		handler: runAddReminder,
		usage: "lukit add-reminder <diary-path> <text>",
		expectedPositional: 2,
	},
	"init-config": {
		handler: runInitConfig,
		usage: "lukit init-config",
		expectedPositional: 0,
	},
};

function loadLocale(io: CliIO): DateLocale {
	const configPath = join(homedir(), ".lukit.json");
	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, "utf-8"));
			if (isDateLocale(config.dateLocale)) {
				return config.dateLocale;
			}
			if (config.dateLocale !== undefined) {
				io.err(`LuKit: invalid dateLocale "${config.dateLocale}" in config — falling back to "de"\n`);
			}
		} catch {
			io.err("Warning: ~/.lukit.json could not be parsed; using default locale 'de'.\n");
		}
	}
	return "de";
}

function printUsage(io: CliIO): void {
	io.out("Usage: lukit <command> [args...]\n\n");
	io.out("Commands:\n");
	for (const [, cmd] of Object.entries(commands)) {
		io.out(`  ${cmd.usage}\n`);
	}
	io.out("\nOptions:\n");
	io.out("  --help     Show this help message\n");
	io.out("  --version  Print the CLI version\n");
}

function printCommandUsage(commandName: string, io: CliIO): void {
	const cmd = commands[commandName];
	if (!cmd) {
		printUsage(io);
		return;
	}
	io.out(`Usage: ${cmd.usage}\n`);
}

function runAddTextToDiary(args: string[], io: CliIO): void {
	const diaryPath = resolve(args[0]);
	const text = args[1].trim();

	if (text.length === 0) {
		io.err("Error: Text cannot be empty.\n");
		io.exit(1);
	}

	if (!existsSync(diaryPath)) {
		io.err(`Error: File not found: ${diaryPath}\n`);
		io.exit(1);
	}

	const locale = loadLocale(io);
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatTextEntry(text);
		const { newContent } = addEntryUnderToday(content, entry, locale);
		writeFileSync(diaryPath, newContent, "utf-8");
	} catch (e) {
		io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
		io.exit(1);
	}

	io.out(`Added entry to ${diaryPath}\n`);
}

function runEnsureTodayHeader(args: string[], io: CliIO): void {
	const diaryPath = resolve(args[0]);

	if (!existsSync(diaryPath)) {
		io.err(`Error: File not found: ${diaryPath}\n`);
		io.exit(1);
	}

	const locale = loadLocale(io);
	let fallback = false;
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const result = ensureTodayHeader(content, locale);
		fallback = result.fallback;
		writeFileSync(diaryPath, result.newContent, "utf-8");
	} catch (e) {
		io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
		io.exit(1);
	}

	if (fallback) {
		io.err("Warning: Diary note is missing the third separator (---). Header was appended at end.\n");
	}

	io.out(`Ensured today's header in ${diaryPath}\n`);
}

function runAddDiaryEntry(args: string[], io: CliIO): void {
	const diaryPath = resolve(args[0]);
	const noteName = args[1].trim();
	const heading = args.length >= 3 ? args[2] : null;

	if (noteName.length === 0) {
		io.err("note-name must not be empty\n");
		io.exit(2);
	}

	if (!existsSync(diaryPath)) {
		io.err(`Error: File not found: ${diaryPath}\n`);
		io.exit(1);
	}

	const locale = loadLocale(io);
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatDiaryEntry(noteName, heading);
		const { newContent } = addEntryUnderToday(content, entry, locale);
		writeFileSync(diaryPath, newContent, "utf-8");
	} catch (e) {
		io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
		io.exit(1);
	}

	io.out(`Added diary entry to ${diaryPath}\n`);
}

function runAddReminder(args: string[], io: CliIO): void {
	const diaryPath = resolve(args[0]);
	const text = args[1].trim();

	if (text.length === 0) {
		io.err("Error: Text cannot be empty.\n");
		io.exit(1);
	}

	if (!existsSync(diaryPath)) {
		io.err(`Error: File not found: ${diaryPath}\n`);
		io.exit(1);
	}

	const locale = loadLocale(io);
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry(text, locale);
		const result = addReminder(content, entry);

		if (!result) {
			io.err("Error: Diary note is missing the third separator (---). Cannot add reminder.\n");
			io.exit(1);
		}

		writeFileSync(diaryPath, result.newContent, "utf-8");
	} catch (e) {
		io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
		io.exit(1);
	}

	io.out(`Added reminder to ${diaryPath}\n`);
}

function runInitConfig(_args: string[], io: CliIO): void {
	const configPath = join(homedir(), ".lukit.json");

	if (existsSync(configPath)) {
		io.err(`Error: Config file already exists: ${configPath}\n`);
		io.err("Remove it first if you want to regenerate.\n");
		io.exit(1);
	}

	const config = {
		diaryPath: "/path/to/your/vault/Work Diary.md",
		dateLocale: "de",
		cliPath: join(process.cwd(), "cli.js"),
		nodePath: process.execPath,
	};

	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
	io.out(`Created ${configPath}\n`);
	io.out("Edit diaryPath to point to your diary note.\n");
}

export function runCli(argv: string[], io: CliIO): void {
	if (argv.includes("--version")) {
		io.out((typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "unknown") + "\n");
		io.exit(0);
	}

	const firstPositional = argv.find((a) => !a.startsWith("--"));

	if (argv.includes("--help")) {
		if (firstPositional && commands[firstPositional]) {
			printCommandUsage(firstPositional, io);
		} else {
			printUsage(io);
		}
		io.exit(0);
	}

	if (argv.length === 0 || !firstPositional) {
		printUsage(io);
		io.exit(0);
	}

	const command = commands[firstPositional];
	if (!command) {
		io.err(`Error: Unknown command '${firstPositional}'\n`);
		printUsage(io);
		io.exit(1);
	}

	const positionals: string[] = [];
	let seenCommand = false;
	for (const a of argv) {
		if (a.startsWith("--")) continue;
		if (!seenCommand) {
			seenCommand = true;
			continue;
		}
		positionals.push(a);
	}

	const max = command.maxPositional ?? command.expectedPositional;
	if (positionals.length < command.expectedPositional) {
		io.err("Error: Missing arguments.\n");
		io.err(`Usage: ${command.usage}\n`);
		io.exit(1);
	}
	if (positionals.length > max) {
		io.err(`Usage: ${command.usage} — extra args (did you forget to quote text?)\n`);
		io.exit(2);
	}

	command.handler(positionals, io);
}

const realIO: CliIO = {
	out: (s) => process.stdout.write(s),
	err: (s) => process.stderr.write(s),
	exit: (code) => process.exit(code),
};

// Auto-run only when executed as the bundled CLI entry. Importing the module
// (e.g. from a test) leaves the CLI dormant.
if (typeof process !== "undefined" && process.argv[1]?.endsWith("cli.js")) {
	runCli(process.argv.slice(2), realIO);
}
