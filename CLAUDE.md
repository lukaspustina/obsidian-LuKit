# LukKit — Obsidian Plugin

## Project Overview
LukKit is a modular Obsidian plugin that bundles multiple workflow automations.
Each use case is a self-contained "feature" in `src/features/<name>/`.

## Build & Test Commands
- `npm install` — install dependencies
- `npm run build` — typecheck + bundle to main.js
- `npm run dev` — bundle in watch mode (no typecheck)
- `npm run test` — run all tests with Vitest

## Architecture
- `src/main.ts` — thin plugin shell, loads features. Orchestration only, no business logic.
- `src/types.ts` — shared interfaces (`LukKitFeature`, settings types)
- `src/settings.ts` — main settings tab, composes sections from features
- `src/shared/` — reusable modals and utilities shared across features
- `src/features/<name>/` — self-contained feature modules
- `tests/unit/` — unit tests for pure logic (no Obsidian mocks needed)
- `tests/acceptance/` — acceptance tests with mocked Obsidian APIs

### Adding a New Feature
1. Create `src/features/<name>/` with a class implementing `LukKitFeature`
2. Add feature-specific settings to a `<name>-settings.ts`
3. Register the feature in `main.ts` → `onload()`
4. Add tests in `tests/unit/` and `tests/acceptance/`

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

## Maintainability
- Each feature is isolated in its own directory
- Shared utilities go in `src/shared/`
- `main.ts` is a thin shell — no business logic
- Each modal in its own file with a single responsibility
- Keep pure logic separate from Obsidian API calls
