#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_fs = require("fs");

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
    return { newContent, headerLineIndex };
  }
  const existingIndex = findTodayHeaderIndex(lines, separatorIndex, date);
  if (existingIndex !== -1) {
    return { newContent: content, headerLineIndex: existingIndex };
  }
  const before = lines.slice(0, separatorIndex + 1);
  const after = lines.slice(separatorIndex + 1);
  const newLines = [...before, header, ...after];
  return { newContent: newLines.join("\n"), headerLineIndex: separatorIndex + 1 };
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
function formatTextEntry(text) {
  return `- ${text}`;
}

// src/cli.ts
var commands = {
  "add-text-to-diary": {
    handler: runAddTextToDiary,
    usage: "lukit add-text-to-diary <diary-path> <text>"
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
