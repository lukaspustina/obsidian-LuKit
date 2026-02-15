# LuKit

A modular Obsidian plugin that bundles workflow automations. Each use case is a self-contained "feature" that can be added independently.

## Features

### Work Diary

Maintains a reverse-chronological work diary in a single note. Each day gets an h5 header with a locale-dependent date (e.g., `##### Fr, 06.02.2026`), followed by bullet points linking to other notes or plain text.

**Commands:**

- **Diary: Ensure today's header** — Creates today's date header if missing, opens the diary note and positions the cursor below it.
- **Diary: Add linked entry** — Pick a note and heading via fuzzy search, inserts a linked entry under today's header. Stays in the current note.
- **Diary: Add current note** — Adds the currently open note (with the heading at cursor position) as a diary entry in one step — no modals. Rejects if the active file is the diary note itself.
- **Diary: Add text entry** — Type free text, inserts it as a bullet under today's header. Stays in the current note.
- **Diary: Add reminder** — Type a quick thought or reminder, inserts it under a `# Erinnerungen` section between frontmatter and the diary separator (third `---`). Newest entries appear first, each tagged with the current date (e.g., `- Call dentist, 07.02.2026`).

**Setup:** Set the diary note path in Settings > LuKit.

### Vorgang

Automates adding a new section to "Vorgang"-style notes. A Vorgang note has a `# Inhalt` table of contents with bullet entries, followed by `##### Name, DD.MM.YYYY` sections with bullet points. This feature inserts a new TOC entry and h5 header in one step, positioning the cursor for immediate typing.

**Commands:**

- **Vorgang: Add section** — Prompts for a section name, inserts a TOC bullet under `# Inhalt` and an h5 header section, then places the cursor on a blank bullet below the new header. If no `# Inhalt` exists, one is created. Also adds a linked diary entry (e.g., `- [[Note#Section, DD.MM.YYYY|Note: Section, DD.MM.YYYY]]`) under today's header in the configured diary note. Silently skips the diary entry if no diary path is configured.

### Besprechung

Extracts key sections from meeting notes (Besprechungsnotizen) and inserts them at the cursor in the active note. Picks a note from a configurable folder via fuzzy search, extracts configurable h3 sections (default: `### Nächste Schritte` and `### Zusammenfassung`), converts the h3 headers to bold, and inserts the formatted summary.

**Commands:**

- **Besprechung: Add summary** — Pick a meeting note from the configured folder, extract the key sections, and insert at the cursor position.

**Setup:** Set the Besprechung folder path and section headings in Settings > LuKit. Section headings are comma-separated (e.g. `Nächste Schritte, Zusammenfassung, Agenda`).

### Migration

Auto-detects and converts old-format notes to the current format with a single command. Handles both **Vorgang** and **Diary** notes:

- **Vorgang notes** (detected by `**Inhalt**` or `# Inhalt`): Converts bold top-level sections (`**Fakten**`, `**nächste Schritte**`, `**Inhalt**`) to h1 headings, renames `Fakten` → `Fakten und Pointer`, capitalizes section names, converts bold entry headers to h5, converts plain TOC entries to wikilinks, and adds a configurable tag to frontmatter.
- **Diary notes** (no `Inhalt` section): Converts bold date headers to h5.

**Commands:**

- **Migration: Convert note** — Auto-detects the note type, prompts for a frontmatter tag (Vorgang only, default: `"Vorgang"`), shows a confirmation dialog with the number of changes, and applies the migration. Safe to run multiple times (idempotent).

## Settings

### Date format

Controls the date format used in diary headers, Vorgang sections, and reminders. Available options:

| Setting | Date format | Weekdays | Example header |
|---------|------------|----------|----------------|
| German (default) | DD.MM.YYYY | So, Mo, Di, Mi, Do, Fr, Sa | `##### Fr, 06.02.2026` |
| English | MM/DD/YYYY | Sun, Mon, Tue, Wed, Thu, Fri, Sat | `##### Fri, 02/06/2026` |
| ISO | YYYY-MM-DD | *(none)* | `##### 2026-02-06` |

## Commands Reference

| Command | Description |
|---|---|
| **Diary: Ensure today's header** | Creates today's date header if missing, opens the diary note |
| **Diary: Add linked entry** | Pick a note and heading via fuzzy search, inserts under today's header |
| **Diary: Add current note** | Add the active note (with heading at cursor) as a diary entry — no modals |
| **Diary: Add text entry** | Type free text, inserts as a bullet under today's header |
| **Diary: Add reminder** | Type a reminder, inserts under `# Erinnerungen` with date |
| **Vorgang: Add section** | Prompts for a name, inserts TOC entry + h5 header section + diary entry |
| **Besprechung: Add summary** | Pick a meeting note, extract key sections, insert at cursor |
| **Migration: Convert note** | Auto-detect note type and convert old format to current |
| **Help** | Show the LuKit help dialog |

## CLI

LuKit also provides a command-line interface for use outside of Obsidian.

```sh
npm run build:cli    # build the CLI
node cli.js --help   # show available commands
```

### add-text-to-diary

Adds a plain-text entry under today's date header in a diary note.

```sh
lukit add-text-to-diary <diary-path> <text>
```

Example:

```sh
lukit add-text-to-diary path/to/diary.md "reviewed the budget"
```

### ensure-today-header

Ensures today's date header exists in a diary note. Warns if the diary structure is missing the third separator.

```sh
lukit ensure-today-header <diary-path>
```

Example:

```sh
lukit ensure-today-header path/to/diary.md
```

### add-diary-entry

Adds a linked note entry under today's date header. Optionally specify a heading.

```sh
lukit add-diary-entry <diary-path> <note-name> [heading]
```

Examples:

```sh
lukit add-diary-entry path/to/diary.md "ProjectX" "Tasks"
lukit add-diary-entry path/to/diary.md "MeetingNotes"
```

### add-reminder

Adds a reminder entry under a `# Erinnerungen` section between frontmatter and the diary separator.

```sh
lukit add-reminder <diary-path> <text>
```

Example:

```sh
lukit add-reminder path/to/diary.md "Call dentist"
```

### init-config

Creates a `~/.lukit.json` config file used by the LaunchBar actions. Auto-detects `nodePath` and `cliPath`; you only need to edit `diaryPath`.

```sh
lukit init-config
```

Refuses to overwrite an existing config file.

## LaunchBar Integration

The `launchbar/` directory contains two [LaunchBar](https://www.obdev.at/products/launchbar/) actions for adding entries from anywhere on macOS.

### Setup

1. Build the CLI and generate the config file:
   ```sh
   npm run build:cli
   node cli.js init-config
   ```
2. Edit `~/.lukit.json` — set `diaryPath` to the absolute path of your diary note.
3. Double-click the `.lbaction` bundles in `launchbar/` to install them in LaunchBar.

### Config Reference (`~/.lukit.json`)

| Key          | Required | Description                              | Default              |
|--------------|----------|------------------------------------------|----------------------|
| `diaryPath`  | yes      | Absolute path to the diary note          | _(placeholder)_      |
| `dateLocale` | no       | Date format: `"de"`, `"en"`, or `"iso"` | `"de"`               |
| `cliPath`    | yes      | Absolute path to `cli.js`               | _(auto-detected)_    |
| `nodePath`   | no       | Absolute path to the `node` binary       | `/usr/local/bin/node`|

### Available Actions

- **LuKit Add Reminder** — type a reminder, adds it under `# Erinnerungen`
- **LuKit Add Text to Diary** — type a diary entry, adds it under today's header

## Installation

### Via BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin
2. In BRAT settings, click **Add Beta Plugin** and enter the repo URL
3. Enable LuKit in Settings > Community Plugins

### Manual

1. Download `main.js` and `manifest.json` from the [latest GitHub release](../../releases/latest)
2. Copy them into your vault at `.obsidian/plugins/lukit/`
3. Enable the plugin in Obsidian settings

## Development

```sh
npm install
npm run build    # typecheck + bundle
npm run dev      # bundle in watch mode
npm run test     # run tests
```
