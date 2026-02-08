#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_fs = require("fs");
var import_path = require("path");
var import_os = require("os");

// src/features/work-diary/work-diary-engine.ts
var GERMAN_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function formatTodayHeader(date) {
  const d = date ?? /* @__PURE__ */ new Date();
  const weekday = GERMAN_WEEKDAYS[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `##### ${weekday}, ${day}.${month}.${year}`;
}
function findThirdSeparatorIndex(lines) {
  let separatorCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      separatorCount++;
      if (separatorCount === 3) {
        return i;
      }
    }
  }
  return -1;
}
function findTodayHeaderIndex(lines, afterLine, date) {
  const header = formatTodayHeader(date);
  for (let i = afterLine + 1; i < lines.length; i++) {
    if (lines[i] === header) {
      return i;
    }
  }
  return -1;
}
function ensureTodayHeader(content, date) {
  const lines = content.split("\n");
  const header = formatTodayHeader(date);
  const separatorIndex = findThirdSeparatorIndex(lines);
  if (separatorIndex === -1) {
    const trimmedContent = content.trimEnd();
    const newContent = trimmedContent + "\n\n---\n" + header + "\n";
    const newLines2 = newContent.split("\n");
    const headerLineIndex = newLines2.indexOf(header);
    return { newContent, headerLineIndex, fallback: true };
  }
  const existingIndex = findTodayHeaderIndex(lines, separatorIndex, date);
  if (existingIndex !== -1) {
    return { newContent: content, headerLineIndex: existingIndex, fallback: false };
  }
  const before = lines.slice(0, separatorIndex + 1);
  const after = lines.slice(separatorIndex + 1);
  const newLines = [...before, header, ...after];
  return { newContent: newLines.join("\n"), headerLineIndex: separatorIndex + 1, fallback: false };
}
function addEntryUnderToday(content, entry, date) {
  const { newContent: contentWithHeader, headerLineIndex } = ensureTodayHeader(content, date);
  const lines = contentWithHeader.split("\n");
  let insertAt = headerLineIndex + 1;
  while (insertAt < lines.length && lines[insertAt].startsWith("- ")) {
    insertAt++;
  }
  lines.splice(insertAt, 0, entry);
  return { newContent: lines.join("\n"), entryLineIndex: insertAt };
}
function formatDiaryEntry(noteName, heading) {
  if (heading) {
    return `- [[${noteName}#${heading}|${noteName}: ${heading}]]`;
  }
  return `- [[${noteName}]]`;
}
function formatTextEntry(text) {
  return `- ${text}`;
}
function formatReminderEntry(text, date) {
  const d = date ?? /* @__PURE__ */ new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `- ${text}, ${day}.${month}.${year}`;
}
function findSecondSeparatorIndex(lines) {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      count++;
      if (count === 2) {
        return i;
      }
    }
  }
  return -1;
}
function findErinnerungenIndex(lines, fromIndex, toIndex) {
  for (let i = fromIndex; i < toIndex; i++) {
    if (lines[i].trim() === "# Erinnerungen") {
      return i;
    }
  }
  return -1;
}
function addReminder(content, entry) {
  const lines = content.split("\n");
  const thirdSep = findThirdSeparatorIndex(lines);
  if (thirdSep === -1) {
    return null;
  }
  const secondSep = findSecondSeparatorIndex(lines);
  const searchStart = secondSep !== -1 ? secondSep + 1 : 0;
  const erinnerungenIdx = findErinnerungenIndex(lines, searchStart, thirdSep);
  if (erinnerungenIdx !== -1) {
    lines.splice(erinnerungenIdx + 1, 0, entry);
  } else {
    const lineBeforeThirdSep = thirdSep > 0 ? lines[thirdSep - 1] : "";
    const needsBlankBefore = lineBeforeThirdSep.trim() !== "";
    const toInsert = needsBlankBefore ? ["", "# Erinnerungen", entry, ""] : ["# Erinnerungen", entry, ""];
    lines.splice(thirdSep, 0, ...toInsert);
  }
  return { newContent: lines.join("\n") };
}

// src/cli.ts
var commands = {
  "add-text-to-diary": {
    handler: runAddTextToDiary,
    usage: "lukit add-text-to-diary <diary-path> <text>"
  },
  "ensure-today-header": {
    handler: runEnsureTodayHeader,
    usage: "lukit ensure-today-header <diary-path>"
  },
  "add-diary-entry": {
    handler: runAddDiaryEntry,
    usage: "lukit add-diary-entry <diary-path> <note-name> [heading]"
  },
  "add-reminder": {
    handler: runAddReminder,
    usage: "lukit add-reminder <diary-path> <text>"
  },
  "init-config": {
    handler: runInitConfig,
    usage: "lukit init-config"
  }
};
function printUsage() {
  console.log("Usage: lukit <command> [args...]\n");
  console.log("Commands:");
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${cmd.usage}`);
  }
  console.log("\nOptions:");
  console.log("  --help    Show this help message");
}
function runAddTextToDiary(args) {
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
  if (!(0, import_fs.existsSync)(diaryPath)) {
    console.error(`Error: File not found: ${diaryPath}`);
    process.exit(1);
  }
  const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
  const entry = formatTextEntry(text);
  const { newContent } = addEntryUnderToday(content, entry);
  (0, import_fs.writeFileSync)(diaryPath, newContent, "utf-8");
  console.log(`Added entry to ${diaryPath}`);
}
function runEnsureTodayHeader(args) {
  if (args.length < 1) {
    console.error("Error: Missing arguments.");
    console.error("Usage: lukit ensure-today-header <diary-path>");
    process.exit(1);
  }
  const diaryPath = args[0];
  if (!(0, import_fs.existsSync)(diaryPath)) {
    console.error(`Error: File not found: ${diaryPath}`);
    process.exit(1);
  }
  const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
  const { newContent, fallback } = ensureTodayHeader(content);
  (0, import_fs.writeFileSync)(diaryPath, newContent, "utf-8");
  if (fallback) {
    console.warn("Warning: Diary note is missing the third separator (---). Header was appended at end.");
  }
  console.log(`Ensured today's header in ${diaryPath}`);
}
function runAddDiaryEntry(args) {
  if (args.length < 2) {
    console.error("Error: Missing arguments.");
    console.error("Usage: lukit add-diary-entry <diary-path> <note-name> [heading]");
    process.exit(1);
  }
  const diaryPath = args[0];
  const noteName = args[1];
  const heading = args.length >= 3 ? args[2] : null;
  if (!(0, import_fs.existsSync)(diaryPath)) {
    console.error(`Error: File not found: ${diaryPath}`);
    process.exit(1);
  }
  const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
  const entry = formatDiaryEntry(noteName, heading);
  const { newContent } = addEntryUnderToday(content, entry);
  (0, import_fs.writeFileSync)(diaryPath, newContent, "utf-8");
  console.log(`Added diary entry to ${diaryPath}`);
}
function runAddReminder(args) {
  if (args.length < 2) {
    console.error("Error: Missing arguments.");
    console.error("Usage: lukit add-reminder <diary-path> <text>");
    process.exit(1);
  }
  const diaryPath = args[0];
  const text = args[1].trim();
  if (text.length === 0) {
    console.error("Error: Text cannot be empty.");
    process.exit(1);
  }
  if (!(0, import_fs.existsSync)(diaryPath)) {
    console.error(`Error: File not found: ${diaryPath}`);
    process.exit(1);
  }
  const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
  const entry = formatReminderEntry(text);
  const result = addReminder(content, entry);
  if (!result) {
    console.error("Error: Diary note is missing the third separator (---). Cannot add reminder.");
    process.exit(1);
  }
  (0, import_fs.writeFileSync)(diaryPath, result.newContent, "utf-8");
  console.log(`Added reminder to ${diaryPath}`);
}
function runInitConfig(_args) {
  const configPath = (0, import_path.join)((0, import_os.homedir)(), ".lukit.json");
  if ((0, import_fs.existsSync)(configPath)) {
    console.error(`Error: Config file already exists: ${configPath}`);
    console.error("Remove it first if you want to regenerate.");
    process.exit(1);
  }
  const config = {
    diaryPath: "/path/to/your/vault/Work Diary.md",
    cliPath: (0, import_path.join)(process.cwd(), "cli.js"),
    nodePath: process.execPath
  };
  (0, import_fs.writeFileSync)(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`Created ${configPath}`);
  console.log("Edit diaryPath to point to your diary note.");
}
function main() {
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
