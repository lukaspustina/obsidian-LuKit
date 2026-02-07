import { readFileSync, writeFileSync, existsSync } from "fs";
import {
	formatTextEntry,
	formatDiaryEntry,
	addEntryUnderToday,
	ensureTodayHeader,
} from "./features/work-diary/work-diary-engine";

type CommandHandler = (args: string[]) => void;

const commands: Record<string, { handler: CommandHandler; usage: string }> = {
	"add-text-to-diary": {
		handler: runAddTextToDiary,
		usage: "lukit add-text-to-diary <diary-path> <text>",
	},
	"ensure-today-header": {
		handler: runEnsureTodayHeader,
		usage: "lukit ensure-today-header <diary-path>",
	},
	"add-diary-entry": {
		handler: runAddDiaryEntry,
		usage: "lukit add-diary-entry <diary-path> <note-name> [heading]",
	},
};

function printUsage(): void {
	console.log("Usage: lukit <command> [args...]\n");
	console.log("Commands:");
	for (const [name, cmd] of Object.entries(commands)) {
		console.log(`  ${cmd.usage}`);
	}
	console.log("\nOptions:");
	console.log("  --help    Show this help message");
}

function runAddTextToDiary(args: string[]): void {
	if (args.length < 2) {
		console.error("Error: Missing arguments.");
		console.error("Usage: lukit add-text-to-diary <diary-path> <text>");
		process.exit(1);
	}

	const diaryPath = args[0];
	const text = args[1].trim();

	if (text.length === 0) {
		console.error("Error: Text cannot be empty.");
		process.exit(1);
	}

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const content = readFileSync(diaryPath, "utf-8");
	const entry = formatTextEntry(text);
	const { newContent } = addEntryUnderToday(content, entry);
	writeFileSync(diaryPath, newContent, "utf-8");

	console.log(`Added entry to ${diaryPath}`);
}

function runEnsureTodayHeader(args: string[]): void {
	if (args.length < 1) {
		console.error("Error: Missing arguments.");
		console.error("Usage: lukit ensure-today-header <diary-path>");
		process.exit(1);
	}

	const diaryPath = args[0];

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const content = readFileSync(diaryPath, "utf-8");
	const { newContent, fallback } = ensureTodayHeader(content);
	writeFileSync(diaryPath, newContent, "utf-8");

	if (fallback) {
		console.warn("Warning: Diary note is missing the third separator (---). Header was appended at end.");
	}

	console.log(`Ensured today's header in ${diaryPath}`);
}

function runAddDiaryEntry(args: string[]): void {
	if (args.length < 2) {
		console.error("Error: Missing arguments.");
		console.error("Usage: lukit add-diary-entry <diary-path> <note-name> [heading]");
		process.exit(1);
	}

	const diaryPath = args[0];
	const noteName = args[1];
	const heading = args.length >= 3 ? args[2] : null;

	if (!existsSync(diaryPath)) {
		console.error(`Error: File not found: ${diaryPath}`);
		process.exit(1);
	}

	const content = readFileSync(diaryPath, "utf-8");
	const entry = formatDiaryEntry(noteName, heading);
	const { newContent } = addEntryUnderToday(content, entry);
	writeFileSync(diaryPath, newContent, "utf-8");

	console.log(`Added diary entry to ${diaryPath}`);
}

function main(): void {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help") {
		printUsage();
		process.exit(0);
	}

	const commandName = args[0];
	const command = commands[commandName];

	if (!command) {
		console.error(`Error: Unknown command '${commandName}'`);
		printUsage();
		process.exit(1);
	}

	command.handler(args.slice(1));
}

main();
