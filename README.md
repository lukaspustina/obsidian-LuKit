# LuKit

A modular Obsidian plugin that bundles workflow automations. Each use case is a self-contained "feature" that can be added independently.

## Features

### Work Diary

Maintains a reverse-chronological work diary in a single note. Each day gets an h5 header with a German-locale date (e.g., `##### Fr, 06.02.2026`), followed by bullet points linking to other notes or plain text.

**Commands:**

- **Ensure today's header** — Creates today's date header if missing, opens the diary note and positions the cursor below it.
- **Add diary entry** — Pick a note and heading via fuzzy search, inserts a linked entry under today's header. Stays in the current note.
- **Add text entry** — Type free text, inserts it as a bullet under today's header. Stays in the current note.

**Setup:** Set the diary note path in Settings > LuKit.

### Absatz

Automates adding a new section to "Vorgang"-style notes. A Vorgang note has a `# Inhalt` table of contents with bullet entries, followed by `##### Name, DD.MM.YYYY` sections with bullet points. This feature inserts a new TOC entry and h5 header in one step, positioning the cursor for immediate typing.

**Commands:**

- **Add Absatz section** — Prompts for a section name, inserts a TOC bullet under `# Inhalt` and an h5 header section, then places the cursor on a blank bullet below the new header. If no `# Inhalt` exists, one is created.

### Besprechung

Extracts key sections from meeting notes (Besprechungsnotizen) and inserts them at the cursor in the active note. Picks a note from a configurable folder via fuzzy search, extracts `### Nächste Schritte` and `### Zusammenfassung`, converts the h3 headers to bold, and inserts the formatted summary.

**Commands:**

- **Add Besprechung summary** — Pick a meeting note from the configured folder, extract the key sections, and insert at the cursor position.

**Setup:** Set the Besprechung folder path in Settings > LuKit.

### Migration

Converts old-format Vorgang notes to the current format. Old notes use `**Name, DD.MM.YYYY**` (bold) for section headers and plain `- Name, DD.MM.YYYY` for TOC entries under `# Inhalt`. This command converts bold headers to `##### Name, DD.MM.YYYY` (h5) and plain TOC entries to `- [[#Name, DD.MM.YYYY]]` (clickable wikilinks).

**Commands:**

- **Migrate Vorgang note (bold → h5)** — Converts the active note from old bold-header format to h5 headers and wikilink TOC entries. Safe to run multiple times (idempotent).

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
