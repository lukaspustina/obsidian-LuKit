# SDD Implementation Report: erinnerungen-triage.md

**Date**: 2026-07-02
**Phases run**: 1, 2
**Overall status**: all-shipped
**SDD amendments suggested**: none

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Engine: Erinnerungen parsen, löschen, umterminieren | shipped | 8bf7bed |
| 2 | Walk-Integration: heterogene Stops | shipped | d979701 |

## Phase 1: Engine

**Status**: shipped · **Commit**: 8bf7bed

| # | Criterion | Tests | Status |
|---|-----------|-------|--------|
| 1 | listReminders + selectDueReminders Reihenfolge [überfällig, datumslos] | p1_c1 | passing |
| 2 | rescheduleReminderLine (de), Rest byte-identisch | p1_c2 | passing |
| 3 | Komma im Erinnerungstext | p1_c3 | passing |
| 4 | Datumslose Zeile erhält erstmals Suffix | p1_c4 | passing |
| 5 | Locale-Roundtrip en/iso | p1_c5 | passing |
| 6 | Stale Zeile → null (kein Throw) | p1_c6 | passing |
| 7 | Duplikatzeilen: erstes Vorkommen | p1_c7 | passing |
| 8 | Fehlende Sektion / fehlender dritter Trenner → [] | p1_c8 | passing |
| 9 | reminderOverdueLabel (de/en, null, heute) | p1_c9 | passing |

Reviewer: PASS, 0 Blocker/Amendments/Nits. Reuse verifiziert (findSecondSeparatorIndex/findErinnerungenIndex, extractDateFromTitle; keine dritte Separator-Kopie).

## Phase 2: Walk-Integration

**Status**: shipped · **Commit**: d979701

| # | Criterion | Tests | Status |
|---|-----------|-------|--------|
| 1 | Stop-Reihenfolge [Erinnerung, Erinnerung, Task] | p2_c1 | passing |
| 2 | ⌘D löscht Zeile via vault.process, counts.completed | p2_c2 | passing |
| 3 | ⌘1 schreibt Datum auf walkToday+1 um, counts.snoozed | p2_c3 | passing |
| 4 | Esc → counts.skipped, Notiz unverändert | p2_c4 | passing |
| 5 | Enter öffnet Tagebuch an lineIndex (Cursor-Assert), Walk stoppt | p2_c5 | passing |
| 6 | Externe Löschung → Notice, Walk bleibt stehen | p2_c6 | passing |
| 7 | TaskNotes-Degradation (nur Erinnerungen + Notice) | p2_c7 | passing |
| 8 | Kein Tagebuch-Pfad → nur Tasks, keine Meldung | p2_c8 | passing |
| 9 | Beide Quellen leer → „Keine fälligen Tasks oder Erinnerungen" | p2_c9 | passing |
| 10 | availableActions + gerenderte Meta-Zeile (Datum/ohne Datum/überfällig) | p2_c10 | passing |
| 11 | Erinnerungs-Previews immer frisch (nie Cache) | p2_c11 | passing |

Reviewer: zunächst BLOCKED (R16: zwei kompakt formatierte `FeatureInternals`-Interfaces in `p2_c6`/`p2_c12` waren halb migriert) — behoben vor dem Commit; danach PASS. Nachtrag: Die beiden /sdd-verify-PARTIALs (Cursor-Assert in c5, Meta-Zeilen-Rendering in c10) wurden nachträglich geschlossen — c10 rendert den Header jetzt headless über einen Recording-Element-Stub. Verbleibender Nit: `sourcePath`-Fallback `""` nur im degenerierten Fall erreichbar.

**R16-Umfang real**: alle 13 `p2_*`-Dateien + `task-triage-walk-guards.test.ts` migriert (`stops: TriageStop[]`, `availableActions(stop)`); Task-Zuweisungen als `{ kind: "task", task }` gewrappt. Der Re-Entry-Test brauchte zwei Microtask-Hops, weil `beginWalk` jetzt zuerst die Erinnerungen lädt.

## Manual Test Plan

1. In der Tagebuch-Notiz unter `# Erinnerungen` drei Zeilen anlegen: eine überfällige (`- Test A, 01.07.2026`), eine ohne Datum (`- Test B`), eine zukünftige (`- Test C, 31.12.2026`). Kommando „Vorgänge: Fällige Aufgaben durchgehen" — erwartet: Stop 1 = „Test A" (Meta: `1/… · Erinnerung · fällig 01.07.2026 · 1d überfällig`), Vorschau zeigt die Erinnerungen-Sektion; „Test C" erscheint nicht.
2. ⌘D auf Stop 1 — erwartet: Zeile „Test A" ist aus der Notiz gelöscht, nächster Stop „Test B" (Meta: `fällig ohne Datum`, kein Überfällig-Segment), Vorschau ohne „Test A".
3. ⌘1 auf „Test B" — erwartet: Zeile lautet `- Test B, <morgen>`; danach folgen die TaskNotes-Stops wie bisher.
4. TaskNotes deaktivieren, Kommando erneut — erwartet: Notice „TaskNotes-Plugin nicht gefunden …", Walk läuft trotzdem mit den fälligen Erinnerungen.
5. Enter auf einem Erinnerungs-Stop — erwartet: Tagebuch öffnet mit Cursor auf der Zeile, Summary-Notice erscheint.
6. Hinweis: Der Live-Smoke-Test gegen echtes TaskNotes ≥ 4.10 steht weiterhin aus (unverändert seit v1.15).
