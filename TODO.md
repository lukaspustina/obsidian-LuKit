# TODO

## Completed

- [x] Configurable date format (`dateLocale` setting: `de`, `en`, `iso`)
- [x] LaunchBar integration for `add-reminder` CLI command
- [x] LaunchBar integration for `add-text-to-diary` and `add-diary-entry` CLI commands
- [x] Migration: auto-detect Vorgang vs Diary notes, top-level bold → h1, Fakten → Fakten und Pointer rename, frontmatter tag insertion
- [x] Diary: Add current note — one-step diary entry from the active note (heading at cursor, no modals)
- [x] Vorgang: Add section now also creates a linked diary entry automatically
- [x] Email Filing: walk Apple Mail inbox, file each message into a Vorgang/Person/Bestellung/Bewerbung note (engines, bridge, feature) — osascript bridge pending manual smoke test against real accounts (esp. Gmail archive mailbox)
- [x] Email Filing conversations (v2): assemble full thread (received + Sent replies) with dedup against the Vorgang; single-shot "File selected Mail message" for initiated threads; cross-session routing mined from Vorgänge (cached in data.json) — `listSentForThread`/`getSelection` JXA pending manual smoke test
- [x] Vorgang next-steps intake: filing a Besprechung or an email thread also deposits its action items below an `#### Unsortiert` marker in `# Nächste Schritte`, drained via a third stop kind in the triage walk (take over, discard, snooze, or pick individual items)
- [x] Email filing: saved images, PDFs and Office documents are embedded (`![[…]]`) for inline preview
- [x] Task Triage: "Vorgang: Aufgaben durchgehen" triages the active note alone, regardless of dates
- [x] Vorgang split: move selected facts and h5 sections into another (or a new) Vorgang
- [x] Office previews: Quick Look renders the first page of every Office/iWork/OpenDocument file into `_previews/`, kept current across Macs; drag & drop inserts the preview embed — pending manual smoke test in Obsidian (drop of a small + a large file, rename into a new folder)
- [x] Office previews: automatic embedding below every linking note after a render on this Mac, plus "Office-Vorschauen: Fehlende Einbettungen ergänzen" for existing previews and later links — smoke-tested 2026-10-05 in a generated vault (wikilinks and Markdown/relative links, re-render and second backfill without duplicates, canvas untouched); backfilled in Lu (1011/1016) and Bumbelu (167/167)

## Office previews — follow-ups (correctness passes 2 and 3, 2026-10-02)

- [ ] Office previews: mutation (2026-10-05) left 141 surviving mutants in `office-previews-engine.ts` and 236 in `office-previews-feature.ts` — tighten the fixtures that let them through (`auto-embed.ts` done: 24 survivors left, all argued equivalent in `tests/unit/office-previews-auto-embed-mutants.test.ts`'s commit)
- [x] Auto embed: Markdown-embed titles in single quotes or parentheses are not recognised (generateMarkdownLink writes none)
- [ ] Auto embed: a wikilink nested inside another link's alias (`[[Notiz|[[Datei|Text]]]]`, malformed) is not anchored — the outer link consumes it (1 pair in Lu); won't fix unless it recurs

- [x] A rename or delete during `store.write` lets the write land at the old mirror path (orphaned marked image, stale `aktuell` entry)
- [ ] A renamed job that runs before its serialised `handleRename` writes the new mirror first; the old marked preview stays orphaned
- [ ] `evaluate`/reconcile apply a decision computed before an await to a path that may have been renamed meanwhile (stale `current`/`collision` entries)
- [ ] Collision retry fires only on create/delete at the mirror path, not when the foreign file is renamed away
- [ ] Pending drop embeds are keyed by source path and not moved on rename (a renamed dropped file silently times out)
- [ ] `dispose()` between qlmanage finishing and the `sips` spawn still spawns `sips` after unload
- [x] Case-only rename (`Report.docx` → `report.docx`): the case-insensitive `adapter.exists` sees the old mirror as occupant, so the preview is not moved
- [ ] A mirror read mid-write by sync (partial bytes) is classified foreign; the collision clears only on create/delete, not on the completing modify
- [ ] A throw inside `run` (unreadable source, synchronous spawn error) records no failure and gives a dropped file no failure Notice
- [ ] `insert` reports "inserted" when the plan inside `vault.process` turns null (note changed after the read), so the pending embed is not retried
- [ ] Reconcile's 0 ms yield timers are not tracked by `stopWork`/`onunload` (harmless: `live()` ends the loop)
- [ ] A collision found in `run` does not drop the path from the `current` set (status count)
