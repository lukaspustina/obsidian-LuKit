# LuKit

A modular Obsidian plugin that bundles workflow automations. Each use case is a self-contained "feature" that can be added independently.

## Features

### Work Diary

Maintains a reverse-chronological work diary in a single note. Each day gets an h5 header with a locale-dependent date (e.g., `##### Fr, 06.02.2026`), followed by bullet points linking to other notes or plain text.

**Commands:**

- **Tagebuch: Heutiges Datum hinzufügen** — Creates today's date header if missing, opens the diary note and positions the cursor below it.
- **Tagebuch: Notiz per Suche hinzufügen** — Pick a note and heading via fuzzy search, inserts a linked entry under today's header. Stays in the current note.
- **Tagebuch: Aktuelle Notiz hinzufügen** — Adds the currently open note (with the heading at cursor position) as a diary entry in one step — no modals. Rejects if the active file is the diary note itself.
- **Tagebuch: Texteintrag hinzufügen** — Type free text and pick a date (defaults to today), inserts it as a bullet under that date's header. Stays in the current note.
- **Tagebuch: Erinnerung hinzufügen** — Type a reminder and pick a due date (defaults to today), inserts it under a `# Erinnerungen` section between frontmatter and the diary separator (third `---`). Newest entries appear first, each tagged with the chosen date (e.g., `- Call dentist, 13.02.2026`).

**Setup:** Set the diary note path in Settings > LuKit.

### Vorgang

Automates adding a new section to "Vorgang"-style notes. A Vorgang note has a `# Inhalt` table of contents with bullet entries, followed by `##### Name, DD.MM.YYYY` sections with bullet points. This feature inserts a new TOC entry and h5 header in one step, positioning the cursor for immediate typing.

**Commands:**

- **Vorgang: Abschnitt hinzufügen** — Prompts for a section name and date (defaults to today), inserts a TOC bullet under `# Inhalt` and an h5 header section, then places the cursor on a blank bullet below the new header. If no `# Inhalt` exists, one is created. Also adds a linked diary entry (e.g., `- [[Note#Section, DD.MM.YYYY|Note: Section, DD.MM.YYYY]]`) under the chosen date's header in the configured diary note. Silently skips the diary entry if no diary path is configured.

### Besprechung

Extracts key sections from meeting notes (Besprechungsnotizen) and inserts them at the cursor in the active note. Picks a note from a configurable folder via fuzzy search, extracts configurable h3 sections (default: `### Nächste Schritte` and `### Zusammenfassung`), converts the h3 headers to bold, and inserts the formatted summary.

When some configured sections are absent from the meeting note, the available ones are still inserted and a `→ See full notes: [[Besprechung]] (missing: …)` line is appended so you can open the original. If none of the configured sections are present, the insertion is just that link line — the command does not abort.

When the active note is tagged `Vorgang`, `Person`, `Bestellung`, or `Bewerbung`, the summary is inserted as a linked h5 section under `# Inhalt` (with TOC bullet) instead of at the cursor.

**Commands:**

- **Besprechung: Zusammenfassung einfügen** — Pick a meeting note from the configured folder, extract the key sections, and insert at the cursor position (or as a linked section if the active note is a Vorgang/Person/Bestellung/Bewerbung; in that case the besprechung is also stamped with `filed_into`/`filed_at` so it feeds the suggestion corpus).
- **Besprechungen: Alle offenen ablegen** — For each Besprechung tagged with the configured pending tag (default: `todo`), pick a target Vorgang/Person/Bestellung/Bewerbung. The picker pins the most likely target(s) to the top as `★ <name> (Vorschlag)` rows, ranked from past `filed_into` routings and the besprechung's title — recurring meetings and 1:1s usually land their target first; the full list stays below and the suggestion is always overridable. The summary is filed into the picked note, the pending tag is removed, and the Besprechung gets `filed_into: "[[Vorgang]]"` and `filed_at: <ISO>` stamps in its frontmatter (so future automation can learn from past routings). Picker also offers: `↪ Besprechung überspringen` (leave it pending, advance), `✕ Nicht ablegen (nur Tag entfernen)`, and `→ Stopp und in neuem Tab öffnen` (for cases needing manual review). Keyboard: Enter files into the highlighted note, **Esc (or click outside) = Skip**, **⌘. = Stop**, **⌘N = Don't file**; the shortcuts are shown in the modal's hint bar. Processing order (oldest or newest first by creation time) is configurable.
- **Besprechung: Aktuelle Notiz ablegen** — Same as above (including the pinned suggestions), but operates on the active Besprechung instead of iterating the pending backlog. Active note must have `Besprechung` in its frontmatter `tags`; the command files into the picked target regardless of pending-tag state, so it works for back-filling untagged besprechungen too. Picker offers Pick + `✕ Don't file`; ESC cancels.

**Setup:** Set the Besprechung folder path, section headings, pending tag, and pending order in Settings > LuKit. Section headings are comma-separated (e.g. `Nächste Schritte, Zusammenfassung, Agenda`).

### Migration

Auto-detects and converts old-format notes to the current format with a single command. Handles both **Vorgang** and **Diary** notes:

- **Vorgang notes** (detected by `**Inhalt**` or `# Inhalt`): Converts bold top-level sections (`**Fakten**`, `**nächste Schritte**`, `**Inhalt**`) to h1 headings, renames `Fakten` → `Fakten und Pointer`, capitalizes section names, converts bold entry headers to h5, converts plain TOC entries to wikilinks, and adds a configurable tag to frontmatter.
- **Diary notes** (no `Inhalt` section): Converts bold date headers to h5.

**Commands:**

- **Konvertierung: Altes Format migrieren** — Auto-detects the note type, prompts for a frontmatter tag (Vorgang only, default: `"Vorgang"`), shows a confirmation dialog with the number of changes, and applies the migration. Safe to run multiple times (idempotent).

### Email Filing (macOS / Apple Mail only)

Walks your Apple Mail inbox one message at a time and files each into a Vorgang/Person/Bestellung/Bewerbung note — the inbox-zero counterpart to **Besprechungen: Alle offenen ablegen**. For each message you pick a target note (the most likely targets are pinned on top by a name-match ranking), review the assembled thread in a preview, and the messages are archived in Mail and embedded as one h5 section. Quoted history, signatures, and inline images are stripped; each message keeps a `message://` link (in its sub-header) back to the archived original.

The inbox is the queue: filing or dismissing a message moves it out of the inbox, so nothing is re-offered and no copies are stored in the vault.

Filing an email captures the **whole conversation**: your Sent replies **and** the thread's other emails still in your inbox are pulled in alongside the received message and written as one section, newest-first, de-duplicated against what the Vorgang already contains (re-filing a thread only adds new messages). The sibling inbox emails are archived too, so the whole thread leaves the inbox. In the preview each message has an **include/exclude checkbox** and an **editable body** — excluding one keeps it out of the note but still archives it. Suggestions also learn across sessions from Vorgänge you've filed into before.

**Commands:**

- **E-Mails: Posteingang ablegen** — Walk the inbox. Per message: pick a target (then review the assembled thread in a per-message preview — include/exclude checkbox + editable body per message — and confirm), `↪ Überspringen` (leave in inbox), `✕ Nicht ablegen` (archive without filing), or `→ Stopp` (open in Mail and stop). Keyboard: Enter files, **Esc = Skip**, **⌘. = Stop**, **⌘N = Nur archivieren**, **⌘P = toggle the email peek**; shortcuts shown in the modal's hint bar.
- **E-Mail: In Mail ausgewählte Nachricht ablegen** — File the message(s) currently selected in Apple Mail (any mailbox, **including Sent**) and their thread into a Vorgang — **capture-only, nothing is archived**. Use it for threads you started (which never land in the inbox). Configure a Sent mailbox per account in settings (**Detect accounts** fills it in).

**Setup:** In Settings > LuKit, set the walk order, the default archive mailbox, and a per-account archive mailbox (use **Detect accounts** to populate them). Each detected account also gets an **include-in-walk** toggle — uncheck accounts you don't triage here to keep the walk fast. Gmail accounts typically archive to `[Gmail]/All Mail`. Requires granting Obsidian permission to control Mail (System Settings → Privacy → Automation).

### Task Triage (requires TaskNotes ≥ 4.10.0)

Walks all [TaskNotes](https://github.com/callumalpass/tasknotes) tasks that are due or scheduled until today — the same set as an "Until today" Bases view — and forces one quick decision per task, without opening the TaskNotes edit modal each time. Every stop shows the task header (title plus one compact line: position, overdue indicator, due/scheduled, priority, recurring badge, contexts, linked projects) and a large Markdown-rendered content preview (for Vorgang notes trimmed to `# Fakten und Pointer` plus the newest three sections — what happened last and what's next).

All task access goes through the TaskNotes runtime API, so user-remapped field names, custom statuses, and recurring semantics stay correct. TaskNotes must be installed and at least version 4.10.0 (first release with the runtime API).

**Command:**

- **Vorgänge: Fällige Tasks durchgehen** — Walk the due tasks. Keyboard per stop: **⌘D = complete** (recurring tasks: check off today's instance), **⌘1/⌘2/⌘3 = snooze** to tomorrow / +1 week / next Monday, **⌘T = snooze to a chosen date**, **⌘X = skip today's instance** (recurring only; snooze is hidden for recurring tasks and ⌘X for non-recurring ones), **Enter = open & stop**, **Esc = skip**, **⌘. = stop**. A summary Notice reports completed / snoozed / instances skipped / skipped / remaining.

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
| **Tagebuch: Heutiges Datum hinzufügen** | Creates today's date header if missing, opens the diary note |
| **Tagebuch: Notiz per Suche hinzufügen** | Pick a note and heading via fuzzy search, inserts under today's header |
| **Tagebuch: Aktuelle Notiz hinzufügen** | Add the active note (with heading at cursor) as a diary entry — no modals |
| **Tagebuch: Texteintrag hinzufügen** | Type free text and pick a date, inserts as a bullet under that date's header |
| **Tagebuch: Erinnerung hinzufügen** | Type a reminder and pick a due date, inserts under `# Erinnerungen` |
| **Vorgang: Abschnitt hinzufügen** | Prompts for a name, inserts TOC entry + h5 header section + diary entry |
| **Besprechung: Zusammenfassung einfügen** | Pick a meeting note, extract key sections, insert at cursor (or as a linked section in Vorgang/Person/Bestellung/Bewerbung notes) |
| **Besprechungen: Alle offenen ablegen** | Walk Besprechungen tagged with the pending tag, pick a target section note for each; files the summary and removes the pending tag |
| **Besprechung: Aktuelle Notiz ablegen** | File the active Besprechung into a section note (Vorgang/Person/Bestellung/Bewerbung); same insertion + frontmatter stamping as 'Alle offenen ablegen' |
| **E-Mails: Posteingang ablegen** | (macOS/Apple Mail) Walk the inbox; file each message's conversation (received + your Sent replies) into a section note (archive + embed) or dismiss; inbox-zero, no vault copies |
| **E-Mail: In Mail ausgewählte Nachricht ablegen** | (macOS/Apple Mail) File the selected Mail message(s) + thread into a section note; capture-only (no archive); for threads you initiated |
| **Vorgänge: Fällige Tasks durchgehen** | (requires TaskNotes ≥ 4.10.0) Walk all tasks due/scheduled until today; complete, snooze, or skip each via keyboard |
| **Konvertierung: Altes Format migrieren** | Auto-detect note type and convert old format to current |
| **Help** | Show the LuKit help dialog |

## CLI

LuKit also provides a command-line interface for use outside of Obsidian.

```sh
npm run build:cli    # build the CLI
node cli.js --help   # show available commands
```

> **Note**: The examples below use `node cli.js`. After `npm link`, the `lukit` alias becomes available globally.

### add-text-to-diary

Adds a plain-text entry under today's date header in a diary note.

```sh
node cli.js add-text-to-diary <diary-path> <text>
```

Example:

```sh
node cli.js add-text-to-diary path/to/diary.md "reviewed the budget"
```

### ensure-today-header

Ensures today's date header exists in a diary note. Warns if the diary structure is missing the third separator.

```sh
node cli.js ensure-today-header <diary-path>
```

Example:

```sh
node cli.js ensure-today-header path/to/diary.md
```

### add-diary-entry

Adds a linked note entry under today's date header. Optionally specify a heading.

```sh
node cli.js add-diary-entry <diary-path> <note-name> [heading]
```

Examples:

```sh
node cli.js add-diary-entry path/to/diary.md "ProjectX" "Tasks"
node cli.js add-diary-entry path/to/diary.md "MeetingNotes"
```

### add-reminder

Adds a reminder entry under a `# Erinnerungen` section between frontmatter and the diary separator.

```sh
node cli.js add-reminder <diary-path> <text>
```

Example:

```sh
node cli.js add-reminder path/to/diary.md "Call dentist"
```

### init-config

Creates a `~/.lukit.json` config file used by the LaunchBar actions. Auto-detects `nodePath` and `cliPath`; you only need to edit `diaryPath`.

```sh
node cli.js init-config
```

Refuses to overwrite an existing config file.

## LaunchBar Integration

The `launchbar/` directory contains two [LaunchBar](https://www.obdev.at/products/launchbar/) actions for adding entries from anywhere on macOS.

### Setup

1. Build the CLI and generate the config file:
   ```sh
   npm run build:cli
   node cli.js init-config   # or: lukit init-config after npm link
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

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](../../releases/latest)
2. Copy them into your vault at `.obsidian/plugins/lukit/`
3. Enable the plugin in Obsidian settings

## Development

**Prerequisites**: Node.js ≥ 18, npm.

```sh
npm install
npm run build      # typecheck + bundle
npm run build:cli  # bundle CLI only
npm run dev        # bundle in watch mode
npm run test       # run tests
```
