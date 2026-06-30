# SDD: Besprechung Filing Suggestions

**Status**: Done
**Finished**: 2026-06-30
**Original**: specs/sdd/besprechung-filing-suggestions.md
**Refined**: 2026-06-30

---

## Overview

The two Besprechung filing commands (`File pending notes`, `File this Besprechung`) currently present an unranked, mtime-sorted picker of every `Vorgang/Person/Bestellung/Bewerbung` note. This SDD adds an auto-suggestion layer that pins the most likely target note(s) to the top of that picker, ranked from the existing `filed_into` history plus the besprechung's own title. The corpus already exists: every filed besprechung carries `filed_into: "[[<target>]]"` and `filed_at: <ISO>`.

---

## Context & Constraints

- TypeScript strict mode, ES2022, Obsidian plugin + Node CLI, esbuild, Vitest. No `any`, explicit return types on all exported functions, named exports only (no default export except the Plugin class).
- CLAUDE.md rule: `*-engine.ts` files must remain free of `obsidian` imports and be directly unit-testable on plain data. Verified by grep; must stay verified.
- The suggestion logic is pure and lives in a new `besprechung-suggest-engine.ts`. The feature gathers the corpus from `metadataCache` and passes plain data in.
- Single-user offline desktop; no security concerns beyond the existing model. No new settings keys (tunables are internal constants).
- `Date.now()` is available at runtime; the engine accepts `now` as a parameter so tests stay deterministic.

---

## Architecture

Three layers, mirroring the existing engine/feature/modal split.

**Data flow (per filing command):**
1. The feature enumerates filed besprechungen from `metadataCache` (those with a `filed_into` value), building `FiledRecord[]`.
2. The feature collects the modal's selectable note basenames (the `Vorgang/Person/Bestellung/Bewerbung` set).
3. The feature calls `suggestFilingTargets(candidateTitle, corpus, candidateBasenames, { now })`.
4. The returned ordered basenames are handed to `SectionNoteSuggestModal`, which pins them above the sentinels and the full list.

**Two signals, combined:**
- **History (collaborative):** token similarity between the candidate title and each past besprechung's title, summed per `filed_into` target, recency-weighted by `filed_at`. Captures recurring meetings (identical Granola `title`) and topic meetings.
- **Name-match (content):** token overlap between the candidate title and each candidate note's *own* name (section-type prefix stripped). Captures 1:1s and feedback talks (`Abstimmung Petra Schneider` → `Person - Petra Schneider`), including the first-ever meeting with a person who already has a note but no filing history.

---

## File & Module Structure

```
src/
  features/besprechung/
    besprechung-suggest-engine.ts   (NEW) pure ranker: title normalization + scoring
    besprechung-feature.ts          (MODIFIED) gather corpus, compute suggestions, pass to modal
  shared/modals/
    section-note-suggest.ts         (MODIFIED) accept optional ranked suggestions, pin to top
tests/
  unit/besprechung-suggest-engine.test.ts   (NEW) ranker unit tests
  acceptance/besprechung-feature.test.ts     (MODIFIED) suggestions reach the modal
```

`SectionNoteSuggestOptions` is the existing interface in `src/shared/modals/section-note-suggest.ts`; Phase 2 adds one optional field to it (it is not newly introduced).

---

## Data Models

```typescript
// besprechung-suggest-engine.ts

export interface FiledRecord {
  rawTitle: string;        // frontmatter `title`, else basename, of a past filed besprechung
  target: string;          // resolved filed_into target basename (no path, no [[ ]], no alias, no .md)
  filedAt: number | null;  // epoch ms; null when filed_at is absent/unparseable
}

export type SuggestionReason = "history" | "name-match" | "both";

export interface FilingSuggestion {
  target: string;          // candidate note basename (no .md)
  score: number;
  reason: SuggestionReason;
}

export interface SuggestOptions {
  now: number;             // epoch ms, for recency weighting
  maxSuggestions?: number; // default 3
  minScore?: number;       // default 0.15
}
```

---

## Requirements

### Engine (pure)

**REQ-01** A new file `src/features/besprechung/besprechung-suggest-engine.ts` shall export `suggestFilingTargets(candidateTitle: string, corpus: FiledRecord[], candidateBasenames: string[], options: SuggestOptions): FilingSuggestion[]` and the helper `normalizeTitleTokens(raw: string): string[]`. The file shall not import from `obsidian`.

**REQ-02** `normalizeTitleTokens(raw)` shall, in order:
1. Strip a leading `Besprechung - ` prefix (case-insensitive).
2. Strip every trailing `, DD.MM.YYYY` date group via the regex `/(?:,\s*\d{2}\.\d{2}\.\d{4})\s*$/` applied repeatedly until no match remains (handles one or more trailing dates, e.g. `"Call Jonas Klein, 25.03.2026, 25.03.2026"` → `"Call Jonas Klein"`). Dates not at the end of the string are left untouched.
3. Lowercase.
4. Split on `/[^a-z0-9äöüß]+/` and discard empty segments (so `"Müller-Schmidt"` → `["müller", "schmidt"]`).
5. Drop tokens of length 1, tokens that are purely numeric (`/^\d+$/`), and tokens present in the module-level `DEFAULT_STOPWORDS` set.

`DEFAULT_STOPWORDS` is a module-level constant containing German filler words and generic meeting words (`mit`, `zu`, `und`, `der`, `die`, `das`, `am`, `im`, `vs`, `call`, `update`, `abstimmung`, `austausch`, `status`, `bi`, `weekly`) plus the self-name `mustermann`. The set is defined in code; unit tests assert the documented *behaviors* (prefix strip, trailing-date strip, numeric-token drop, length-1 drop, and that representative members `call` and `mit` are removed), not exhaustive set membership.

**REQ-03** The history signal shall, for each `FiledRecord`, compute the Jaccard similarity between the candidate token set and the record's normalized title token set, multiply by a recency weight, and **sum** the weighted values per `target`. The recency weight shall be `0.5 ^ (ageDays / 180)` clamped to a floor of `0.25`, where `ageDays = max(0, (now - filedAt) / 86_400_000)`; a `null` `filedAt` shall use the floor weight `0.25`. (Jaccard of two empty token sets is 0.)

**REQ-04** The name-match signal shall, for each entry in `candidateBasenames`, strip a leading section-type prefix (`Vorgang - `, `Person - `, `Bestellung - `, `Bewerbung - `, case-insensitive) and tokenize the remainder with `normalizeTitleTokens`. The name-match score for that candidate shall be the **recall of the note-name tokens against the title**: the count of candidate-note name tokens that appear in the besprechung title's token set divided by the number of candidate-note name tokens (0 when the note name has no tokens). Recall (note∩title / note) is chosen deliberately so that a note whose full identity appears in the title scores 1.0 regardless of extra title words. Worked example: note `Person - Petra Schneider` → name tokens `["petra", "schneider"]`; title `Abstimmung Petra Schneider` → title tokens `["petra", "schneider"]` (`abstimmung` is a stopword); recall = 2/2 = 1.0.

**REQ-05** The combined score per target shall be `0.6 * normalizedHistory + 0.4 * nameMatch`, where `normalizedHistory` is the target's summed history score (REQ-03) divided by the maximum summed history score across all targets (0 when no target has any history). A target with zero history but positive name-match therefore scores up to `0.4`, which exceeds the default `minScore` of `0.15` — name-match alone can produce a suggestion. `reason` shall be `"both"` when both the history component and the name-match component are positive, else `"history"` or `"name-match"` for whichever single component is positive.

**REQ-06** `suggestFilingTargets` shall return only targets present in `candidateBasenames` (compared as basenames without `.md`; history targets that are not currently selectable are dropped), only those with `score >= minScore` (default `0.15`), sorted by descending `score`, capped at `maxSuggestions` (default `3`). Ties on `score` shall break by descending summed history score, then ascending alphabetical `target`.

**REQ-07** `suggestFilingTargets` shall return an empty array when no target clears `minScore`, and shall never throw on empty or malformed input (empty `candidateTitle`, empty `corpus`, empty `candidateBasenames`, records with empty `rawTitle`).

### Modal

**REQ-08** `SectionNoteSuggestModal` (`src/shared/modals/section-note-suggest.ts`) shall accept an optional `suggestions?: string[]` field on the existing `SectionNoteSuggestOptions` interface — an ordered list of suggested note basenames (without `.md`).

**REQ-09** The modal's item ordering shall be, in this exact order: (1) one pinned row per suggested basename that resolves to a current candidate file, in the order given by `suggestions`; (2) the virtual sentinels that are currently shown (`Skip` / `Don't file` / `Stop+open`, each only when its callback is provided); (3) the mtime-sorted full list with pinned files removed. A pinned row's display text shall be `★ <basename> (suggested)`. Choosing a pinned row shall invoke `onPick` with the corresponding `TFile`, identically to choosing that file from the full list.

**REQ-10** Any `TFile` rendered as a pinned suggestion row shall be excluded from the mtime-sorted full list, so it appears exactly once. Suggested basenames that do not resolve to a current candidate file shall produce no pinned row.

**REQ-11** When `suggestions` is absent or an empty array, the modal's item list and ordering shall be byte-for-byte unchanged from current behaviour (sentinels, then mtime-sorted notes) and no pinned rows shall exist. (When `suggestions` is present, pinned rows precede the sentinels per REQ-09; when absent or empty, the sentinels precede the full list exactly as today.)

### Feature wiring

**REQ-12** `BesprechungFeature` shall build the filing corpus by scanning all `.md` files under the configured `settings.besprechung.folderPath` whose frontmatter carries a `filed_into` value. For each, it shall produce a `FiledRecord` with: `rawTitle` = frontmatter `title` (falling back to the file `basename`); `target` = the `filed_into` value resolved by calling `extractWikilinkTarget(<filed_into string>)` (already exported from `src/shared/note-structure.ts` and already imported in `besprechung-feature.ts`), which strips `[[`/`]]`, a `#anchor`, a `|alias`, the path segment after the last `/`, and a trailing `.md` (e.g. `"[[Vorgang - X|Alias]]"` → `"Vorgang - X"`, `"[[folder/Vorgang - X]]"` → `"Vorgang - X"`); records where `extractWikilinkTarget` returns `null` shall be skipped. `filedAt` = `Date.parse(filed_at)` when present and finite, else `null`. The besprechung currently being filed shall be excluded from its own corpus. No new wikilink-parsing helper shall be created.

**REQ-13** For both `filePendingCmd` (per besprechung in the walk) and `fileActiveBesprechungCmd`, `BesprechungFeature` shall compute `suggestFilingTargets(candidateTitle, corpus, candidateBasenames, { now: Date.now() })` — where `candidateTitle` is the besprechung's frontmatter `title` or its `basename` — and pass the resulting ordered basenames as `suggestions` to `SectionNoteSuggestModal`. Before constructing the modal, the feature shall enumerate `candidateBasenames` itself by calling `app.vault.getMarkdownFiles()` filtered by `frontmatterTagsInclude(tags, BesprechungFeature.SECTION_NOTE_TAGS)` — identical to the filter in `SectionNoteSuggestModal.getItems()` — taking each match's `basename` (without `.md`). The same enumeration is the candidate set passed to the engine; the modal retains its own internal enumeration for fuzzy filtering. `SECTION_NOTE_TAGS` may remain `private static readonly` — the enumeration code lives inside `BesprechungFeature`, so the modifier does not block it.

**REQ-14** Suggestion computation shall never block or abort filing. Any error raised while gathering the corpus or computing suggestions shall be caught, logged via `console.warn`, and treated as "no suggestions" so the picker still opens with the full list and an empty `suggestions`.

---

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Corpus gather / suggestion compute throws | malformed frontmatter, unexpected metadataCache shape | catch, `console.warn`, pass `suggestions: []` | picker opens normally with full unranked list |
| `filed_at` absent/unparseable | older besprechung, hand-edited frontmatter | `filedAt = null` → recency floor weight `0.25` | record still contributes to history at floor weight |
| Suggested basename has no current file | target note renamed/deleted since filing | no pinned row for it | that suggestion silently omitted |
| No target clears `minScore` | low-signal besprechung | engine returns `[]` | no pinned rows; full list only |

---

## Implementation Phases

## Phase 1 — Suggestion Engine

Implement `besprechung-suggest-engine.ts` (REQ-01–REQ-07) with full unit coverage. Pure logic, no Obsidian, no callers yet — independently committable and testable.

**Phase complete when:** `npm run test` passes with the new unit suite; `rg "from \"obsidian\"" src/features/besprechung/besprechung-suggest-engine.ts` returns nothing; `npm run build` typechecks.

### Test Scenarios

- GIVEN `normalizeTitleTokens("Besprechung - Call Jonas Klein, 25.03.2026, 25.03.2026")` WHEN called THEN returns `["jonas", "klein"]` (prefix stripped, both trailing date groups stripped, `call` stopword dropped, length-1 dropped).
- GIVEN `normalizeTitleTokens("")` WHEN called THEN returns `[]` without throwing.
- GIVEN `normalizeTitleTokens("Müller-Schmidt 11 mit Team")` WHEN called THEN returns `["müller", "schmidt", "team"]` (umlaut preserved, hyphen split, numeric `11` dropped, `mit` stopword dropped).
- GIVEN a corpus with two records `{ rawTitle: "Compliance & IT", target: "Vorgang - Informationssicherheit", filedAt: <recent> }` and candidates including `"Vorgang - Informationssicherheit"` WHEN `suggestFilingTargets("Compliance & IT", corpus, candidates, { now })` is called THEN the first result has `target === "Vorgang - Informationssicherheit"` and `reason` is `"history"` or `"both"`.
- GIVEN an empty corpus and candidate title `"Abstimmung Petra Schneider"` and candidates `["Person - Petra Schneider"]` WHEN called THEN returns one result with `target === "Person - Petra Schneider"` and `reason === "name-match"`.
- GIVEN a history target `"Protokolle Vorstand"` not present in `candidateBasenames` WHEN scoring THEN the result contains no entry with `target === "Protokolle Vorstand"`.
- GIVEN two targets with equal summed raw history but different `filedAt` (one recent, one 400 days ago) and a fixed `now` WHEN scored THEN the more recently filed target has the higher score and appears first.
- GIVEN a record with `filedAt: null` WHEN the recency weight is computed THEN the weight is `0.25` (the floor).
- GIVEN four candidates all scoring above `minScore` with default `maxSuggestions` of 3 WHEN called THEN the result length is exactly 3.
- GIVEN all computed scores below `minScore` (default `0.15`) WHEN called THEN returns `[]`.
- GIVEN two candidates with identical combined score and identical summed history WHEN called THEN they are ordered ascending alphabetically by `target`.
- GIVEN empty `candidateBasenames` (or empty title, or empty corpus) WHEN called THEN returns `[]` without throwing.

## Phase 2 — Modal Pinning

Extend `SectionNoteSuggestModal` to accept and render `suggestions` (REQ-08–REQ-11). Default (no suggestions) behaviour is unchanged, so this is independently committable. The shared modal now has two layout modes (with/without pins); this is acceptable at this scale — if a third variation appears it warrants extraction.

**Phase complete when:** new acceptance assertions for pinned rows pass; existing `section-note-suggest` / besprechung acceptance tests still pass unchanged; `npm run build` typechecks.

### Test Scenarios

- GIVEN `suggestions: ["Vorgang - A"]` and candidate files A, B, C WHEN items are built THEN the first item's display text is `"★ Vorgang - A (suggested)"`.
- GIVEN the same modal WHEN items are built THEN `"Vorgang - A"` does not appear in the mtime-sorted lower list (the file appears exactly once).
- GIVEN a pinned row for `"Vorgang - A"` is chosen WHEN `onPick` fires THEN it receives the `TFile` for `"Vorgang - A"` (the same object as choosing it from the full list).
- GIVEN `suggestions: ["Vorgang - A", "Vorgang - B"]` and candidate files including A and B WHEN items are built THEN the first two items are the pinned rows in order `A`, `B`, before any sentinel.
- GIVEN `suggestions` containing `"Vorgang - Ghost"` that resolves to no candidate file WHEN items are built THEN no pinned row is created for it and no error is thrown.
- GIVEN no `suggestions` field WHEN items are built THEN item order equals current behaviour (sentinels first, then mtime-sorted notes) and no pinned rows exist.
- GIVEN `suggestions: []` WHEN items are built THEN behaviour is identical to no `suggestions` field.

## Phase 3 — Feature Wiring

Wire corpus-gathering and suggestion computation into `filePendingCmd` and `fileActiveBesprechungCmd` (REQ-12–REQ-14).

**Phase complete when:** acceptance tests prove suggestions reach the modal for both commands and that a suggestion failure degrades to the full unranked list; full `npm run test` and `npm run build` pass.

**Test scaffolding:** Assert the `suggestions` array reaching the modal by capturing the `options` argument passed to `SectionNoteSuggestModal`'s constructor with `vi.mock('../../shared/modals/section-note-suggest', …)` using a factory that replaces `SectionNoteSuggestModal` with a spy class recording each construction into a module-level array. `vi.spyOn` cannot intercept a constructor that `besprechung-feature.ts` imports by value (`new SectionNoteSuggestModal(...)`), so the `vi.mock` factory is required; no change to `tests/helpers/obsidian-mocks.ts` is needed. `getMarkdownFiles()` in the mock returns all registered files and the feature applies its own folder filter, so register corpus besprechungen under `settings.besprechung.folderPath` (e.g. `Besprechungen/`) and candidate section notes under a different path (e.g. `Vorgänge/`) so the folder filter partitions corpus from candidates.

### Test Scenarios

- GIVEN a vault with two filed besprechungen both having `filed_into: "[[Vorgang - Informationssicherheit]]"` and title `"Compliance & IT"` WHEN `File this Besprechung` runs on a new `"Compliance & IT"` note THEN `SectionNoteSuggestModal` is constructed with `suggestions[0] === "Vorgang - Informationssicherheit"`.
- GIVEN the `filePendingCmd` walk processing besprechung X WHEN the modal for X is built THEN X is excluded from the `FiledRecord[]` passed to the engine.
- GIVEN corpus-gathering throws (mocked) WHEN either filing command runs THEN `SectionNoteSuggestModal` is still opened with `suggestions: []` and the full candidate list intact, and `console.warn` is called.
- GIVEN a besprechung with no frontmatter `title` WHEN the corpus is built THEN its `rawTitle` falls back to the file `basename`.
- GIVEN a `filed_into` value of `"[[Vorgang - X|Some Alias]]"` WHEN the corpus is built THEN `target` is `"Vorgang - X"` (alias stripped).

---

## Decision Log

- **Heuristic token ranker, not ML/embeddings.** The labeled signal (recurring titles, person names in titles, topic keywords) is strong and the corpus is small; an embedding model or new dependency violates KISS/YAGNI for no measurable gain. Rejected.
- **Combine history + name-match (vs. either alone).** History alone gives no suggestion for a first-ever 1:1 with an existing Person note; name-match alone misses recurring topic meetings that don't name the Vorgang. Both chosen for coverage. (User decision.)
- **Trailing-date stripping is German `DD.MM.YYYY`-only by design.** REQ-02's date regex handles only the German form, not the locale-aware behavior of `extractDateFromTitle`. This matches the Besprechung filename convention (`Besprechung - <name>, DD.MM.YYYY`); the preferred title source — the Granola `title` frontmatter — carries no date at all, so the regex only matters for the basename fallback. `dateLocale` is intentionally not threaded into the pure engine (YAGNI).
- **Name-match uses note-name recall, not Jaccard.** We want "does this note's full identity appear in the title?", which recall over note-name tokens answers directly; Jaccard would penalize titles that carry extra words (most do). Chosen deliberately (REQ-04).
- **`normalizedHistory` divides by the max summed history (known limitation).** When exactly one target has any history, its `normalizedHistory` is 1.0 even from a single weak match, so it can reach the combined `0.6` floor on thin evidence. Accepted for this iteration: a lone past filing that is at all similar is a reasonable suggestion, and name-match still competes. A dampened or count-aware normalization is deferred (no current need).
- **Pin-to-top UI (vs. pre-filling the search box or an accept-sentinel).** Pinning is non-destructive, leaves fuzzy search fully usable, surfaces multiple suggestions, and is always overridable with one keystroke. Pre-fill clobbers typing and shows only one; a sentinel fits only one well. (User decision.)
- **Top 1–3 above a confidence margin (vs. always-one or always-three).** Avoids confidently-wrong or noisy pins on low-signal besprechungen. (User decision.)
- **Restrict suggestions to the modal's selectable set.** A learned target like `Protokolle Vorstand …` is not a tagged section note and cannot be picked, so suggesting it would be a dead end. Intersect with `candidateBasenames`.
- **No new settings.** Weights, half-life, threshold, and stopwords are internal constants; nothing in the brainstorm asked for user tuning. The stopword set lives in code so the test suite is not a change-detector for one user's vocabulary.
- **Out of the editor `Add summary` flow.** That command inserts at the cursor of an already-open target note; there is no target to suggest.

## Open Decisions

None.

## Out of Scope

- The editor-based `Besprechung: Add summary` / `Add multiple summaries` commands (no target-note choice to assist).
- Any new user-facing setting for weights, threshold, stopwords, or enabling/disabling suggestions.
- Suggesting or creating targets that are not existing, currently-selectable section notes (no new-note creation, no untagged targets).
- Using besprechung *body* content or `attendees` frontmatter as signals — title + filing history only for this iteration.
- A dampened/count-aware history normalization (see Decision Log limitation).
- CLI exposure of suggestions.
