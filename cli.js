#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  runCli: () => runCli
});
module.exports = __toCommonJS(cli_exports);
var import_fs = require("fs");
var import_path = require("path");
var import_os = require("os");

// src/shared/date-format.ts
var GERMAN_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
var ENGLISH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatDate(date, locale) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  switch (locale) {
    case "de":
      return `${day}.${month}.${year}`;
    case "en":
      return `${month}/${day}/${year}`;
    case "iso":
      return `${year}-${month}-${day}`;
  }
}
function formatWeekday(date, locale) {
  switch (locale) {
    case "de":
      return GERMAN_WEEKDAYS[date.getDay()];
    case "en":
      return ENGLISH_WEEKDAYS[date.getDay()];
    case "iso":
      return null;
  }
}
function parseDateString(str, locale) {
  switch (locale) {
    case "de": {
      const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str);
      if (!match) return null;
      return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    }
    case "en": {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
      if (!match) return null;
      return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
    }
    case "iso": {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      if (!match) return null;
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
}
function isDateLocale(v) {
  return v === "de" || v === "en" || v === "iso";
}
function formatDateWithWeekday(date, locale) {
  const dateStr = formatDate(date, locale);
  const weekday = formatWeekday(date, locale);
  if (weekday) {
    return `${weekday}, ${dateStr}`;
  }
  return dateStr;
}

// src/shared/note-structure.ts
function stripTrailingBrackets(s) {
  return s.replace(/\]+$/, "");
}

// src/shared/diary.ts
function formatTodayHeader(locale, date) {
  const d = date ?? /* @__PURE__ */ new Date();
  return `##### ${formatDateWithWeekday(d, locale)}`;
}
function findNthSeparatorIndex(lines, n) {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      count++;
      if (count === n) return i;
    }
  }
  return -1;
}
function findThirdSeparatorIndex(lines) {
  return findNthSeparatorIndex(lines, 3);
}
function findTodayHeaderIndex(lines, afterLine, locale, date) {
  const header = formatTodayHeader(locale, date);
  for (let i = afterLine + 1; i < lines.length; i++) {
    if (lines[i] === header) {
      return i;
    }
  }
  return -1;
}
function parseDiaryHeaderDate(header, locale) {
  const text = header.slice("##### ".length).trim();
  const lastComma = text.lastIndexOf(", ");
  const raw = lastComma !== -1 ? text.slice(lastComma + 2).trim() : text;
  return parseDateString(stripTrailingBrackets(raw), locale);
}
function findDiaryHeaderInsertPosition(lines, separatorIndex, date, locale) {
  let lastH5Seen = -1;
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    if (!lines[i].startsWith("##### ")) continue;
    lastH5Seen = i;
    const existing = parseDiaryHeaderDate(lines[i], locale);
    if (existing !== null && existing < date) {
      return i;
    }
  }
  return lastH5Seen === -1 ? separatorIndex + 1 : lines.length;
}
function ensureTodayHeader(content, locale, date) {
  const d = date ?? /* @__PURE__ */ new Date();
  const lines = content.split("\n");
  const header = formatTodayHeader(locale, d);
  const separatorIndex = findThirdSeparatorIndex(lines);
  if (separatorIndex === -1) {
    const trimmedContent = content.trimEnd();
    const newContent = trimmedContent + "\n\n---\n" + header + "\n";
    const newLines2 = newContent.split("\n");
    const headerLineIndex = newLines2.indexOf(header);
    return { newContent, headerLineIndex, fallback: true };
  }
  const existingIndex = findTodayHeaderIndex(lines, separatorIndex, locale, d);
  if (existingIndex !== -1) {
    return { newContent: content, headerLineIndex: existingIndex, fallback: false };
  }
  const insertAt = findDiaryHeaderInsertPosition(lines, separatorIndex, d, locale);
  const newLines = [...lines.slice(0, insertAt), header, ...lines.slice(insertAt)];
  return { newContent: newLines.join("\n"), headerLineIndex: insertAt, fallback: false };
}
function findEntryBlockEnd(lines, headerIndex) {
  let i = headerIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("- ") || line.length > 0 && /^\s/.test(line)) {
      i++;
    } else {
      break;
    }
  }
  return i;
}
function addEntryUnderToday(content, entry, locale, date) {
  const { newContent: contentWithHeader, headerLineIndex } = ensureTodayHeader(content, locale, date);
  const lines = contentWithHeader.split("\n");
  const insertAt = findEntryBlockEnd(lines, headerLineIndex);
  lines.splice(insertAt, 0, entry);
  return { newContent: lines.join("\n"), entryLineIndex: insertAt };
}
function stripWikilinks(text) {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, target, display) => display ?? target);
}
function formatDiaryEntry(noteName, heading) {
  const safeName = noteName.replace(/\]\]|\|/g, "");
  if (heading) {
    const cleanHeading = stripWikilinks(heading).replace(/\]\]|\|/g, "");
    return `- [[${safeName}#${cleanHeading}|${safeName}: ${cleanHeading}]]`;
  }
  return `- [[${safeName}]]`;
}
function formatTextEntry(text) {
  return `- ${text}`;
}

// src/features/work-diary/work-diary-engine.ts
function formatReminderEntry(text, locale, date) {
  const d = date ?? /* @__PURE__ */ new Date();
  return `- ${text}, ${formatDate(d, locale)}`;
}
function findNthSeparatorIndex2(lines, n) {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      count++;
      if (count === n) return i;
    }
  }
  return -1;
}
function findSecondSeparatorIndex(lines) {
  return findNthSeparatorIndex2(lines, 2);
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
    usage: "lukit add-text-to-diary <diary-path> <text>",
    expectedPositional: 2
  },
  "ensure-today-header": {
    handler: runEnsureTodayHeader,
    usage: "lukit ensure-today-header <diary-path>",
    expectedPositional: 1
  },
  "add-diary-entry": {
    handler: runAddDiaryEntry,
    usage: "lukit add-diary-entry <diary-path> <note-name> [heading]",
    expectedPositional: 2,
    maxPositional: 3
  },
  "add-reminder": {
    handler: runAddReminder,
    usage: "lukit add-reminder <diary-path> <text>",
    expectedPositional: 2
  },
  "init-config": {
    handler: runInitConfig,
    usage: "lukit init-config",
    expectedPositional: 0
  }
};
function loadLocale(io) {
  const configPath = (0, import_path.join)((0, import_os.homedir)(), ".lukit.json");
  if ((0, import_fs.existsSync)(configPath)) {
    try {
      const config = JSON.parse((0, import_fs.readFileSync)(configPath, "utf-8"));
      if (isDateLocale(config.dateLocale)) {
        return config.dateLocale;
      }
      if (config.dateLocale !== void 0) {
        io.err(`LuKit: invalid dateLocale "${config.dateLocale}" in config \u2014 falling back to "de"
`);
      }
    } catch {
      io.err("Warning: ~/.lukit.json could not be parsed; using default locale 'de'.\n");
    }
  }
  return "de";
}
function printUsage(io) {
  io.out("Usage: lukit <command> [args...]\n\n");
  io.out("Commands:\n");
  for (const [, cmd] of Object.entries(commands)) {
    io.out(`  ${cmd.usage}
`);
  }
  io.out("\nOptions:\n");
  io.out("  --help     Show this help message\n");
  io.out("  --version  Print the CLI version\n");
}
function printCommandUsage(commandName, io) {
  const cmd = commands[commandName];
  if (!cmd) {
    printUsage(io);
    return;
  }
  io.out(`Usage: ${cmd.usage}
`);
}
function runAddTextToDiary(args, io) {
  const diaryPath = (0, import_path.resolve)(args[0]);
  const text = args[1].trim();
  if (text.length === 0) {
    io.err("Error: Text cannot be empty.\n");
    io.exit(1);
  }
  if (!(0, import_fs.existsSync)(diaryPath)) {
    io.err(`Error: File not found: ${diaryPath}
`);
    io.exit(1);
  }
  const locale = loadLocale(io);
  try {
    const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
    const entry = formatTextEntry(text);
    const { newContent } = addEntryUnderToday(content, entry, locale);
    (0, import_fs.writeFileSync)(diaryPath, newContent, "utf-8");
  } catch (e) {
    io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
    io.exit(1);
  }
  io.out(`Added entry to ${diaryPath}
`);
}
function runEnsureTodayHeader(args, io) {
  const diaryPath = (0, import_path.resolve)(args[0]);
  if (!(0, import_fs.existsSync)(diaryPath)) {
    io.err(`Error: File not found: ${diaryPath}
`);
    io.exit(1);
  }
  const locale = loadLocale(io);
  let fallback = false;
  try {
    const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
    const result = ensureTodayHeader(content, locale);
    fallback = result.fallback;
    (0, import_fs.writeFileSync)(diaryPath, result.newContent, "utf-8");
  } catch (e) {
    io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
    io.exit(1);
  }
  if (fallback) {
    io.err("Warning: Diary note is missing the third separator (---). Header was appended at end.\n");
  }
  io.out(`Ensured today's header in ${diaryPath}
`);
}
function runAddDiaryEntry(args, io) {
  const diaryPath = (0, import_path.resolve)(args[0]);
  const noteName = args[1].trim();
  const heading = args.length >= 3 ? args[2] : null;
  if (noteName.length === 0) {
    io.err("note-name must not be empty\n");
    io.exit(2);
  }
  if (!(0, import_fs.existsSync)(diaryPath)) {
    io.err(`Error: File not found: ${diaryPath}
`);
    io.exit(1);
  }
  const locale = loadLocale(io);
  try {
    const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
    const entry = formatDiaryEntry(noteName, heading);
    const { newContent } = addEntryUnderToday(content, entry, locale);
    (0, import_fs.writeFileSync)(diaryPath, newContent, "utf-8");
  } catch (e) {
    io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
    io.exit(1);
  }
  io.out(`Added diary entry to ${diaryPath}
`);
}
function runAddReminder(args, io) {
  const diaryPath = (0, import_path.resolve)(args[0]);
  const text = args[1].trim();
  if (text.length === 0) {
    io.err("Error: Text cannot be empty.\n");
    io.exit(1);
  }
  if (!(0, import_fs.existsSync)(diaryPath)) {
    io.err(`Error: File not found: ${diaryPath}
`);
    io.exit(1);
  }
  const locale = loadLocale(io);
  try {
    const content = (0, import_fs.readFileSync)(diaryPath, "utf-8");
    const entry = formatReminderEntry(text, locale);
    const result = addReminder(content, entry);
    if (!result) {
      io.err("Error: Diary note is missing the third separator (---). Cannot add reminder.\n");
      io.exit(1);
    }
    (0, import_fs.writeFileSync)(diaryPath, result.newContent, "utf-8");
  } catch (e) {
    io.err("Error: " + (e instanceof Error ? e.message : String(e)) + "\n");
    io.exit(1);
  }
  io.out(`Added reminder to ${diaryPath}
`);
}
function runInitConfig(_args, io) {
  const configPath = (0, import_path.join)((0, import_os.homedir)(), ".lukit.json");
  if ((0, import_fs.existsSync)(configPath)) {
    io.err(`Error: Config file already exists: ${configPath}
`);
    io.err("Remove it first if you want to regenerate.\n");
    io.exit(1);
  }
  const config = {
    diaryPath: "/path/to/your/vault/Work Diary.md",
    dateLocale: "de",
    cliPath: (0, import_path.join)(process.cwd(), "cli.js"),
    nodePath: process.execPath
  };
  (0, import_fs.writeFileSync)(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  io.out(`Created ${configPath}
`);
  io.out("Edit diaryPath to point to your diary note.\n");
}
function runCli(argv, io) {
  if (argv.includes("--version")) {
    io.out((true ? "1.13.1" : "unknown") + "\n");
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
    io.err(`Error: Unknown command '${firstPositional}'
`);
    printUsage(io);
    io.exit(1);
  }
  const positionals = [];
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
    io.err(`Usage: ${command.usage}
`);
    io.exit(1);
  }
  if (positionals.length > max) {
    io.err(`Usage: ${command.usage} \u2014 extra args (did you forget to quote text?)
`);
    io.exit(2);
  }
  command.handler(positionals, io);
}
var realIO = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  exit: (code) => process.exit(code)
};
if (typeof process !== "undefined" && process.argv[1]?.endsWith("cli.js")) {
  runCli(process.argv.slice(2), realIO);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runCli
});
