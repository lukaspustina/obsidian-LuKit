# LuKit — Obsidian Plugin

## Project Overview
LuKit is a modular Obsidian plugin (v1.7.0) that bundles workflow automations for German-language note-taking workflows. Each use case is a self-contained "feature" in `src/features/<name>/`. Notes use German locale formatting (dates like `06.02.2026`, weekdays like `Fr`, section names like `Inhalt`, `Fakten und Pointer`, `Erinnerungen`, `Nächste Schritte`).

## Build & Test Commands
- `npm install` — install dependencies
- `npm run build` — typecheck + bundle to main.js
- `npm run build:cli` — bundle CLI only
- `npm run dev` — bundle in watch mode (no typecheck)
- `npm run test` — run all tests with Vitest

## Features

### Work Diary (`src/features/work-diary/`)
Maintains a reverse-chronological diary in a single note. The diary note has frontmatter, then an optional `# Erinnerungen` section, then a third `---` separator, below which are date-headed entries.
- Date headers: `##### Fr, 06.02.2026` (h5, German weekday, DD.MM.YYYY)
- Entries are bullet points: linked (`- [[NoteName#Heading|NoteName: Heading]]`) or plain text (`- some text`)
- Reminders go under `# Erinnerungen` between frontmatter and the third `---` separator, tagged with date (`- Call dentist, 07.02.2026`)
- The third `---` separator is a critical structural element — diary entries go below it
- Engine: `work-diary-engine.ts` (pure logic), Feature: `work-diary-feature.ts` (Obsidian commands)
- Settings: `diaryNotePath` (path to the single diary note)

### Vorgang (`src/features/vorgang/`)
Automates adding sections to "Vorgang" (case/process) notes. A Vorgang note has:
- `# Fakten und Pointer` — facts section
- `# Inhalt` — table of contents with wikilink bullets (`- [[#Section Name, DD.MM.YYYY]]`)
- `##### Section Name, DD.MM.YYYY` — h5 section headers with bullet content below
- Adding a section creates both a TOC entry and an h5 header, placing cursor for immediate typing
- Engine: `vorgang-engine.ts`, Feature: `vorgang-feature.ts`

### Besprechung (`src/features/besprechung/`)
Extracts key sections from meeting notes and inserts formatted summaries at cursor.
- Picks a note from a configured folder via fuzzy search
- Extracts configurable h3 sections (default: `### Nächste Schritte`, `### Zusammenfassung`)
- Converts h3 headers to bold in the output
- Engine: `besprechung-engine.ts`, Feature: `besprechung-feature.ts`
- Settings: `folderPath`, `sectionHeadings` (array of h3 heading names)

### Migration (`src/features/migration/`)
Auto-detects and converts old-format notes to current format. Idempotent (safe to run multiple times).
- **Vorgang notes** (detected by `**Inhalt**` or `# Inhalt`): bold top-level → h1, `Fakten` → `Fakten und Pointer`, bold entries → h5, plain TOC → wikilinks, adds frontmatter tag
- **Diary notes** (no Inhalt section): bold date headers → h5
- Engine: `migration-engine.ts` (reuses `vorgang-engine.ts` helpers), Feature: `migration-feature.ts`

### CLI (`src/cli.ts` → `cli.js`)
Command-line interface for use outside Obsidian. Commands: `add-text-to-diary`, `ensure-today-header`, `add-diary-entry`, `add-reminder`, `init-config`. Uses `~/.lukit.json` config. LaunchBar actions in `launchbar/` directory for macOS integration.

## Architecture

### File Structure
- `src/main.ts` — thin plugin shell, loads features. Orchestration only, no business logic.
- `src/types.ts` — shared interfaces (`LuKitFeature`, settings types, `DEFAULT_SETTINGS`)
- `src/settings.ts` — main settings tab, composes sections from features
- `src/cli.ts` — CLI entry point, parsed with minimal deps (no Obsidian imports)
- `src/shared/modals/` — reusable modals (`confirm-modal`, `text-input-modal`, `note-suggest`, `folder-note-suggest`, `heading-suggest`, `help-modal`)
- `src/features/<name>/` — self-contained feature modules

### Feature Module Pattern
Each feature has up to 3 files:
- `<name>-engine.ts` — **pure logic**, no Obsidian imports, directly testable. Operates on strings/arrays.
- `<name>-feature.ts` — implements `LuKitFeature`, registers Obsidian commands, reads/writes files via Obsidian API.
- `<name>-settings.ts` — settings interface and defaults (optional, not all features have settings).

### Test Structure
- `tests/unit/` — unit tests for `*-engine.ts` pure logic (no Obsidian mocks needed)
- `tests/acceptance/` — acceptance tests for `*-feature.ts` command flows with mocked Obsidian APIs
- `tests/helpers/obsidian-mocks.ts` — shared Obsidian API mocks

### Examples
- `examples/old/` — pre-migration note styles (bold headers, plain TOC entries, bold date headers in diary)
- `examples/new/` — current note styles (h5 section headers, wikilink TOC entries, `# Fakten und Pointer` / `# Inhalt` structure)
- `examples/test-besprechung.md` — sample meeting note with `### Nächste Schritte` and `### Zusammenfassung` sections

### Adding a New Feature
1. Create `src/features/<name>/` with `<name>-engine.ts` (pure logic) and `<name>-feature.ts` (implements `LuKitFeature`)
2. Add feature-specific settings to a `<name>-settings.ts` if needed
3. Register the feature in `main.ts` → `onload()`
4. Add tests in `tests/unit/` (engine) and `tests/acceptance/` (commands)

## Code Style
- TypeScript strict mode, no `any` types
- Explicit return types on all exported functions
- No default exports except the Plugin class (Obsidian requires it)
- Prefer `const` over `let`, never use `var`
- Use early returns to reduce nesting
- Named exports for everything except the Plugin class

## Security
- Never execute user-provided strings as code
- Validate all file paths before use
- Sanitize modal input (trim whitespace, reject empty where required)
- No dynamic imports or `eval`
- No innerHTML — use Obsidian's DOM creation APIs (`createEl`, `Setting`)

## Testing
- **Every change must pass all tests** — run `npm run test` before considering any change complete
- Unit test all pure logic functions with full branch coverage
- Acceptance test command flows with mocked Obsidian dependencies
- Keep diary-engine.ts and other pure logic free of Obsidian imports so they can be tested without mocks

## Documentation
- **Keep `README.md` up to date** — update it when adding features, commands, or changing setup instructions
- **Keep `TODO.md` up to date** — add planned features, mark completed ones, remove obsolete items

## Maintainability
- Each feature is isolated in its own directory
- Shared utilities go in `src/shared/`
- `main.ts` is a thin shell — no business logic
- Each modal in its own file with a single responsibility
- Keep pure logic separate from Obsidian API calls
