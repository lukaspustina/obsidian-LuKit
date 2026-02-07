# LukKit

A modular Obsidian plugin that bundles workflow automations. Each use case is a self-contained "feature" that can be added independently.

## Features

### Work Diary

Maintains a reverse-chronological work diary in a single note. Each day gets an h5 header with a German-locale date (e.g., `##### Fr, 06.02.2026`), followed by bullet points linking to other notes or plain text.

**Commands:**

- **Ensure today's header** — Creates today's date header if missing, opens the diary note and positions the cursor below it.
- **Add diary entry** — Pick a note and heading via fuzzy search, inserts a linked entry under today's header. Stays in the current note.
- **Add text entry** — Type free text, inserts it as a bullet under today's header. Stays in the current note.

**Setup:** Set the diary note path in Settings > LukKit.

## CLI

LukKit also provides a command-line interface for use outside of Obsidian.

```sh
npm run build:cli    # build the CLI
node cli.js --help   # show available commands
```

### add-text-to-diary

Adds a plain-text entry under today's date header in a diary note.

```sh
lukkit add-text-to-diary <diary-path> <text>
```

Example:

```sh
lukkit add-text-to-diary path/to/diary.md "reviewed the budget"
```

## Installation

Copy `main.js` and `manifest.json` into your vault at `.obsidian/plugins/lukkit/`, then enable the plugin in Obsidian settings.

## Development

```sh
npm install
npm run build    # typecheck + bundle
npm run dev      # bundle in watch mode
npm run test     # run tests
```
