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

interface CommandSpec {
	handler: (args: string[]) => void;
	usage: string;
	expectedPositional: number; // minimum positional args
	maxPositional?: number;     // maximum positional args (defaults to expectedPositional)
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

function loadLocale(): DateLocale {
	const configPath = join(homedir(), ".lukit.json");
	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, "utf-8"));
			if (isDateLocale(config.dateLocale)) {
				return config.dateLocale;
			}
			if (config.dateLocale !== undefined) {
				console.warn(`LuKit: invalid dateLocale "${config.dateLocale}" in config — falling back to "de"`);
			}
		} catch {
			console.warn("Warning: ~/.lukit.json could not be parsed; using default locale 'de'.");
		}
	}
	return "de";
}

function printUsage(): void {
	console.log("Usage: lukit <command> [args...]\n");
	console.log("Commands:");
	for (const [, cmd] of Object.entries(commands)) {
		console.log(`  ${cmd.usage}`);
	}
	console.log("\nOptions:");
	console.log("  --help     Show this help message");
	console.log("  --version  Print the CLI version");
}

function printCommandUsage(commandName: string): void {
	const cmd = commands[commandName];
	if (!cmd) {
		printUsage();
		return;
	}
	console.log(`Usage: ${cmd.usage}`);
}

function runAddTextToDiary(args: string[]): void {
	const diaryPath = resolve(args[0]);
	const text = args[1].trim();

	if (text.length === 0) {
		console.error("Error: Text cannot be empty.");
		process.exit(1);
	}

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const locale = loadLocale();
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatTextEntry(text);
		const { newContent } = addEntryUnderToday(content, entry, locale);
		writeFileSync(diaryPath, newContent, "utf-8");
	} catch (e) {
		console.error("Error: " + (e instanceof Error ? e.message : String(e)));
		process.exit(1);
	}

	console.log(`Added entry to ${diaryPath}`);
}

function runEnsureTodayHeader(args: string[]): void {
	const diaryPath = resolve(args[0]);

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const locale = loadLocale();
	let fallback = false;
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const result = ensureTodayHeader(content, locale);
		fallback = result.fallback;
		writeFileSync(diaryPath, result.newContent, "utf-8");
	} catch (e) {
		console.error("Error: " + (e instanceof Error ? e.message : String(e)));
		process.exit(1);
	}

	if (fallback) {
		console.warn("Warning: Diary note is missing the third separator (---). Header was appended at end.");
	}

	console.log(`Ensured today's header in ${diaryPath}`);
}

function runAddDiaryEntry(args: string[]): void {
	const diaryPath = resolve(args[0]);
	const noteName = args[1].trim();
	const heading = args.length >= 3 ? args[2] : null;

	if (noteName.length === 0) {
		process.stderr.write("note-name must not be empty\n");
		process.exit(2);
	}

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const locale = loadLocale();
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatDiaryEntry(noteName, heading);
		const { newContent } = addEntryUnderToday(content, entry, locale);
		writeFileSync(diaryPath, newContent, "utf-8");
	} catch (e) {
		console.error("Error: " + (e instanceof Error ? e.message : String(e)));
		process.exit(1);
	}

	console.log(`Added diary entry to ${diaryPath}`);
}

function runAddReminder(args: string[]): void {
	const diaryPath = resolve(args[0]);
	const text = args[1].trim();

	if (text.length === 0) {
		console.error("Error: Text cannot be empty.");
		process.exit(1);
	}

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const locale = loadLocale();
	try {
		const content = readFileSync(diaryPath, "utf-8");
		const entry = formatReminderEntry(text, locale);
		const result = addReminder(content, entry);

		if (!result) {
			console.error("Error: Diary note is missing the third separator (---). Cannot add reminder.");
			process.exit(1);
		}

		writeFileSync(diaryPath, result.newContent, "utf-8");
	} catch (e) {
		console.error("Error: " + (e instanceof Error ? e.message : String(e)));
		process.exit(1);
	}

	console.log(`Added reminder to ${diaryPath}`);
}

function runInitConfig(_args: string[]): void {
	const configPath = join(homedir(), ".lukit.json");

	if (existsSync(configPath)) {
		console.error(`Error: Config file already exists: ${configPath}`);
		console.error("Remove it first if you want to regenerate.");
		process.exit(1);
	}

	const config = {
		diaryPath: "/path/to/your/vault/Work Diary.md",
		dateLocale: "de",
		cliPath: join(process.cwd(), "cli.js"),
		nodePath: process.execPath,
	};

	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
	console.log(`Created ${configPath}`);
	console.log("Edit diaryPath to point to your diary note.");
}

function main(): void {
	const argv = process.argv.slice(2);

	// Resolve --version anywhere in argv.
	if (argv.includes("--version")) {
		console.log(typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "unknown");
		process.exit(0);
	}

	// Find the first positional (non-flag) argument; that's the command name.
	const firstPositional = argv.find((a) => !a.startsWith("--"));

	if (argv.includes("--help")) {
		if (firstPositional && commands[firstPositional]) {
			printCommandUsage(firstPositional);
		} else {
			printUsage();
		}
		process.exit(0);
	}

	if (argv.length === 0 || !firstPositional) {
		printUsage();
		process.exit(0);
	}

	const command = commands[firstPositional];
	if (!command) {
		console.error(`Error: Unknown command '${firstPositional}'`);
		printUsage();
		process.exit(1);
	}

	// Strip the command name and any flags; remaining are positionals for the handler.
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
		console.error("Error: Missing arguments.");
		console.error(`Usage: ${command.usage}`);
		process.exit(1);
	}
	if (positionals.length > max) {
		process.stderr.write(`Usage: ${command.usage} — extra args (did you forget to quote text?)\n`);
		process.exit(2);
	}

	command.handler(positionals);
}

main();
