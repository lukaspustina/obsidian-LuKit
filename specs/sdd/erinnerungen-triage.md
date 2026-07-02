# SDD: Erinnerungen-Triage — fällige Tagebuch-Erinnerungen im Triage-Walk

Status: Ready for Implementation
Original: specs/sdd/erinnerungen-triage.md
Created: 2026-07-02
Refined: 2026-07-02

## Overview

Das Remindersystem des Arbeitstagebuchs ist heute write-only: Erinnerungen werden unter `# Erinnerungen` mit Datum abgelegt (`- Zahnarzt anrufen, 13.02.2026`), aber nichts liest, zeigt oder verfällt sie. Dieses Feature nimmt fällige Erinnerungen als zusätzliche Stops in den bestehenden Task-Triage-Walk (`task-triage-walk`) auf: erledigen löscht die Zeile, verschieben schreibt das Datum um, überspringen lässt sie liegen. Ein Loop, zwei Quellen (TaskNotes-Tasks + Tagebuch-Erinnerungen).

## Context & Constraints

- TypeScript strict, Feature-Modul-Muster (pure Engine / impure Feature), Tests via Vitest (`tests/unit` + `tests/acceptance`), UI durchgehend Deutsch, kein PII in Fixtures.
- Erinnerungs-Format lebt in `work-diary-engine.ts` (`formatReminderEntry`, `addReminder`): Zeilen unter `# Erinnerungen` zwischen Frontmatter und drittem `---`-Trenner; `formatReminderEntry` hängt das Datum immer als letztes Segment `, <Datum>` an (Locale via globalem `dateLocale`-Setting).
- Der Triage-Walk (`task-triage-feature.ts`) hat: gepinntes `walkToday`, Re-Entry-Guard, `mutateAndAdvance(mutate, counter)`, Preview-Cache/Prefetch, Fünf-Bucket-Summary (`erledigt/verschoben/ausgelassen/übersprungen/offen` = `completed/snoozed/instancesSkipped/skipped/offen`), Modal mit ⌘D/⌘1-3/⌘T/⌘X/Enter/Esc/⌘. und `availableActions(): { snooze: boolean; skipInstance: boolean }` (genau diese zwei Schlüssel; ⌘D/Enter/Esc/⌘. sind immer verfügbar).
- Acceptance-Tests fahren den Walk headless über den gepinnten Internals-Kontrakt (`beginWalk`/`handle*`/`presentStop` gestubbt, `walkToday` gepinnt).

## Architecture

- **Engine (pure, `work-diary-engine.ts`)**: `ReminderItem { text: string; date: Date | null; line: string; lineIndex: number }`; `listReminders(content, locale)`, `removeReminderLine(content, line)`, `rescheduleReminderLine(content, line, newDate, locale)` (letztere zwei → `{ newContent } | null`; `null` = Zeile nicht gefunden; bei textidentischen Duplikatzeilen wird die erste Vorkommnis mutiert).
- **Datums-Parsing**: `listReminders` trennt am **letzten** `, `-Vorkommen; das Suffix wird end-anchored gegen `parseDateString(suffix, locale)` geprüft. Unparsebar (oder kein Komma) → `date: null`, `text` = ganze Zeile ohne `- `-Präfix. Kommas im Erinnerungstext sind damit robust.
- **Selektion (pure, `task-triage-engine.ts`)**: `TriageStop = { kind: "task"; task: TriageTask } | { kind: "reminder"; reminder: ReminderItem }`; `selectDueReminders(items, todayIso)` — fällig wenn `date === null` oder `toIso(date) <= todayIso`; Sortierung Datum aufsteigend, datumslose zuletzt, Ties stabil in Dokumentreihenfolge (`lineIndex` als Tiebreak). Neu: `reminderOverdueLabel(date: Date | null, todayIso, locale)` — analog `overdueLabel`, aber für ein einzelnes Datum; leerer String bei `null`-Datum oder Fälligkeit heute (die bestehende `overdueLabel(task, …)`-Signatur ist `TriageTask`-gebunden und wird nicht angefasst).
- **Walk (impure, `task-triage-feature.ts`)**: `beginWalk` lädt zusätzlich Erinnerungen (Pfad via `getDiaryNotePath`; kein Pfad oder Notiz fehlt → leere Liste, keine Meldung), baut `TriageStop[]` = [Erinnerungen, dann Tasks] und präsentiert über das bestehende Modal. Handler verzweigen auf `stop.kind`; Erinnerungs-Mutationen laufen als `vault.process`-Closure durch das **unveränderte** `mutateAndAdvance(mutate, counter)`; gibt die Engine-Funktion `null` zurück (Zeile weg), wirft die Closure — bestehender `onMutationError`-Pfad. Locale für alle Umschreibungen: globales `dateLocale`-Setting.
- **Modal (`task-triage-modal.ts`)**: Options tragen den `TriageStop`; Erinnerungs-Stops: `actions = { snooze: true, skipInstance: false }` (vollständiges Objekt), Meta-Zeile `n/total · Erinnerung · fällig <Datum im Locale | „ohne Datum"> [· <reminderOverdueLabel>]` (Überfällig-Segment entfällt bei leerem Label), Titel = `reminder.text`. Vorschau = die komplette `# Erinnerungen`-Sektion (Heading + alle Zeilen bis zum dritten `---`), unverändert als Markdown gerendert, ohne Hervorhebung der aktuellen Zeile.

## Requirements

1. Der Walk shall fällige Erinnerungen aus der konfigurierten Tagebuch-Notiz als eigene Stops präsentieren — vor allen TaskNotes-Stops.
2. Eine Erinnerung shall als fällig gelten, wenn ihr Datum ≤ `walkToday` ist oder sie kein parsebares Datum trägt (datumslos = sofort fällig). Datums-Erkennung: letztes `, `-Segment der Zeile, end-anchored via `parseDateString(…, dateLocale)`.
3. Erinnerungs-Stops shall untereinander nach Datum aufsteigend sortiert sein; datumslose zuletzt; Ties stabil in Dokumentreihenfolge.
4. ⌘D (Erledigt) auf einem Erinnerungs-Stop shall die Erinnerungszeile aus der Tagebuch-Notiz löschen (`vault.process` + `removeReminderLine`; bei Duplikatzeilen die erste).
5. ⌘1/⌘2/⌘3/⌘T auf einem Erinnerungs-Stop shall das Datums-Suffix der Zeile auf morgen / +1 Woche / nächsten Montag / das frei gewählte Datum umschreiben (relativ zu `walkToday`, via `snoozeDate`); datumslose Erinnerungen erhalten dabei erstmals ein `, <Datum>`-Suffix im `dateLocale`-Format.
6. Enter auf einem Erinnerungs-Stop shall die Tagebuch-Notiz öffnen (Cursor auf `lineIndex` der Erinnerung) und den Walk stoppen (kein Count, kein Advance).
7. Esc shall den Erinnerungs-Stop überspringen (Bucket `übersprungen`/`counts.skipped`); ⌘. shall den Walk stoppen; ⌘X shall für Erinnerungs-Stops nicht angeboten werden (Bucket `ausgelassen` bleibt Tasks vorbehalten).
8. Das Modal shall Erinnerungs-Stops kennzeichnen: Meta-Zeile `n/total · Erinnerung · fällig <Datum|„ohne Datum">` plus Überfällig-Label (`reminderOverdueLabel`; Segment entfällt bei datumslosen oder heute fälligen Erinnerungen). Die Vorschau shall die komplette `# Erinnerungen`-Sektion gerendert zeigen.
9. Erinnerungs-Aktionen shall in die bestehenden Summary-Buckets zählen: ⌘D → `erledigt`, Snooze → `verschoben`, Esc → `übersprungen`; nicht besuchte Stops zählen als `offen`.
10. Wenn die Erinnerungszeile bei einer Mutation nicht mehr existiert (extern editiert) oder die Tagebuch-Notiz mid-walk verschwunden ist, shall der bestehende `onMutationError`-Pfad greifen: Notice, keine Zählung, Walk bleibt auf dem Stop.
11. Wenn TaskNotes nicht verfügbar ist (availability-Fail), shall der Walk trotzdem laufen und nur Erinnerungen triagieren; die bestehende TaskNotes-Meldung erscheint zusätzlich als Notice. Nur wenn weder Tasks noch Erinnerungen fällig sind, shall „Keine fälligen Tasks oder Erinnerungen" erscheinen.
12. Ist kein Tagebuch-Pfad konfiguriert oder die Notiz nicht vorhanden, shall der Walk ohne Erinnerungs-Stops und ohne zusätzliche Meldung laufen (das Tagebuch-Skelett-Angebot bleibt den Tagebuch-Kommandos vorbehalten). Ist die Notiz vorhanden, aber nicht lesbar, shall der Walk mit Notice „Tagebuch konnte nicht gelesen werden — Erinnerungen übersprungen: <Fehlermeldung>" nur mit Tasks laufen.
13. Alle neuen Parsing-/Mutations-Funktionen shall pure sein (keine Obsidian-Imports): `listReminders`/`removeReminderLine`/`rescheduleReminderLine` in `work-diary-engine.ts`, `selectDueReminders`/`reminderOverdueLabel`/`TriageStop` in `task-triage-engine.ts`.
14. Das Kommando shall in „Vorgänge: Fällige Aufgaben durchgehen" umbenannt werden (Command-ID `task-triage-walk` unverändert); `helpEntries`, README und CLAUDE.md ziehen mit.

## File & Module Structure

- `src/features/work-diary/work-diary-engine.ts` — neu: `ReminderItem`, `listReminders`, `removeReminderLine`, `rescheduleReminderLine`.
- `src/features/task-triage/task-triage-engine.ts` — neu: `TriageStop`, `selectDueReminders`, `reminderOverdueLabel`.
- `src/features/task-triage/task-triage-feature.ts` — Stop-Liste, Erinnerungs-Handler (Branch auf `stop.kind` vor `mutateAndAdvance`), availability-Degradation, Umbenennung.
- `src/features/task-triage/task-triage-modal.ts` — Stop-Arten in Header/Meta/Preview, `actions`-Gating unverändert genutzt.
- `tests/unit/work-diary-reminders.test.ts` — Engine-Tests (Parsing, Löschen, Umschreiben, Locale-Kanten, Duplikate).
- `tests/acceptance/task-triage-reminders.test.ts` — Walk-Integration headless.

## Data Models

```ts
// work-diary-engine.ts
export interface ReminderItem {
	text: string;        // Zeile ohne "- "-Präfix und ohne Datums-Suffix
	date: Date | null;   // null = datumslos (sofort fällig)
	line: string;        // exakte Originalzeile (Mutations-Schlüssel)
	lineIndex: number;   // 0-basiert in der Notiz (Sortier-Tiebreak, Enter-Cursor)
}

// task-triage-engine.ts
export type TriageStop =
	| { kind: "task"; task: TriageTask }
	| { kind: "reminder"; reminder: ReminderItem };
```

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Zeile nicht gefunden | Erinnerung extern gelöscht/editiert zwischen Walk-Start und Aktion (`removeReminderLine`/`rescheduleReminderLine` → `null`) | Closure wirft → `onMutationError`; Walk bleibt auf dem Stop, keine Zählung | „Aktion fehlgeschlagen — Task bleibt offen." (bestehende Notice) |
| Tagebuch-Notiz mid-walk weg | Notiz gelöscht/umbenannt nach Walk-Start | `vault.process` wirft → gleicher `onMutationError`-Pfad | dito |
| Tagebuch nicht lesbar | vault-Fehler beim Laden zum Walk-Start | Walk läuft nur mit Tasks | „Tagebuch konnte nicht gelesen werden — Erinnerungen übersprungen: `<e.message>`" |
| TaskNotes fehlt | availability-Fail | Walk läuft nur mit Erinnerungen | bestehende TaskNotes-Meldung als Notice |
| Beide Quellen leer | keine fälligen Stops | Walk startet nicht, `walkActive` bleibt false | „Keine fälligen Tasks oder Erinnerungen" |

## Phase 1 — Engine: Erinnerungen parsen, löschen, umterminieren

Pure Funktionen in `work-diary-engine.ts` (`listReminders`, `removeReminderLine`, `rescheduleReminderLine`) und `selectDueReminders`/`reminderOverdueLabel`/`TriageStop` in `task-triage-engine.ts`.

Phase complete when: alle neuen Engine-Funktionen implementiert und unit-getestet sind (inkl. Locale-Varianten `de`/`en`/`iso`, Kommas im Text, Duplikatzeilen); `npm run test` und `npm run build` grün.

### Test Scenarios

- GIVEN eine Tagebuch-Notiz mit `# Erinnerungen` und drei Zeilen (Datum gestern, Datum morgen, ohne Datum) WHEN `listReminders` + `selectDueReminders(walkToday)` laufen THEN enthält das Ergebnis genau zwei Stops in der Reihenfolge [gestern, ohne Datum]; die Morgen-Zeile fehlt.
- GIVEN die Zeile `- Zahnarzt anrufen, 01.07.2026` (Locale `de`) WHEN `rescheduleReminderLine(content, line, new Date(2026, 6, 3), "de")` läuft THEN lautet die Zeile `- Zahnarzt anrufen, 03.07.2026` und alle anderen Zeilen sind byte-identisch.
- GIVEN die Zeile `- Angebot prüfen, verhandeln, 01.07.2026` (Komma im Text) WHEN `listReminders` läuft THEN ist `text` = „Angebot prüfen, verhandeln" und `date` = 01.07.2026.
- GIVEN eine datumslose Zeile `- Zahnarzt anrufen` WHEN `rescheduleReminderLine` läuft THEN erhält sie erstmals ein `, <Datum>`-Suffix im übergebenen Locale.
- GIVEN dieselbe Erinnerung unter Locale `en` und `iso` WHEN `rescheduleReminderLine` läuft THEN entspricht das Datums-Suffix exakt `formatDate(date, locale)`.
- GIVEN eine Zeile, die nicht (mehr) in der Notiz steht WHEN `removeReminderLine`/`rescheduleReminderLine` laufen THEN geben sie `null` zurück (kein Throw).
- GIVEN zwei textidentische Erinnerungszeilen WHEN `removeReminderLine` läuft THEN wird nur das erste Vorkommen (kleinster `lineIndex`) entfernt.
- GIVEN eine Notiz ohne `# Erinnerungen`-Sektion oder ohne dritten `---`-Trenner WHEN `listReminders` läuft THEN liefert es `[]` (kein Fehler).
- GIVEN `reminderOverdueLabel` mit Datum 3 Tage vor `walkToday` (Locale `de`) WHEN es läuft THEN liefert es „3d überfällig"; mit `date === null` oder Datum = heute liefert es `""`.

## Phase 2 — Walk-Integration: heterogene Stops

Stop-Liste (Erinnerungen vor Tasks), Modal-Kennzeichnung + Erinnerungen-Preview, Handler über `mutateAndAdvance` mit `vault.process`-Closures, availability-Degradation (nur-Erinnerungen-Walk), Summary-Zählung, Umbenennung in „Vorgänge: Fällige Aufgaben durchgehen" (R14).

Phase complete when: (a) alle Acceptance-Szenarien grün, `npm run test` und `npm run build` grün; (b) README und CLAUDE.md beschreiben die Erinnerungs-Stops und den neuen Kommandonamen (separater Checklisten-Punkt, blockiert (a) nicht).

### Test Scenarios

- GIVEN zwei fällige Erinnerungen und ein fälliger Task WHEN der Walk startet THEN ist die Stop-Reihenfolge [Erinnerung, Erinnerung, Task] und `position.total` = 3.
- GIVEN ein Erinnerungs-Stop WHEN ⌘D ausgelöst wird THEN ist die Zeile via `vault.process` entfernt, `counts.completed` = 1 und der Walk steht auf dem nächsten Stop.
- GIVEN ein Erinnerungs-Stop WHEN ⌘1 ausgelöst wird THEN trägt die Zeile das Datum `walkToday + 1` im konfigurierten Locale und `counts.snoozed` = 1.
- GIVEN ein Erinnerungs-Stop WHEN Esc ausgelöst wird THEN inkrementiert `counts.skipped` und der Walk steht auf dem nächsten Stop (keine Mutation).
- GIVEN ein Erinnerungs-Stop WHEN Enter ausgelöst wird THEN öffnet die Tagebuch-Notiz mit Cursor auf `lineIndex` und der Walk stoppt (kein Count, kein Advance).
- GIVEN die Erinnerungszeile wurde extern gelöscht WHEN ⌘D ausgelöst wird THEN erscheint eine Notice, `counts` bleiben unverändert und der Walk bleibt auf dem Stop.
- GIVEN TaskNotes nicht verfügbar und eine fällige Erinnerung WHEN der Walk startet THEN läuft er mit genau diesem Erinnerungs-Stop und die TaskNotes-Meldung erscheint als Notice.
- GIVEN kein Tagebuch-Pfad konfiguriert WHEN der Walk startet THEN verhält er sich wie bisher (nur Tasks, keine zusätzliche Meldung).
- GIVEN weder fällige Tasks noch Erinnerungen WHEN der Walk startet THEN erscheint „Keine fälligen Tasks oder Erinnerungen" und `walkActive` bleibt false.
- GIVEN ein Erinnerungs-Stop WHEN das Modal rendert THEN entspricht die Meta-Zeile `n/total · Erinnerung · fällig <Datum|„ohne Datum">[ · <überfällig>]` und ⌘X ist nicht verfügbar (`actions.skipInstance === false`).

## Decision Log

- **Erinnerungen vor den Tasks** (statt danach oder datumsgemischt): Erinnerungen sind meist älter/persönlicher und sollen nicht hinter einer langen Task-Liste verhungern; ein gemischter Strom würde zwei Datums-Semantiken (due/scheduled vs. Erinnerungsdatum) in eine Sortierung zwingen. *(Vom Nutzer bestätigt.)*
- **Erledigt = Zeile löschen** (statt durchstreichen oder als Tagebucheintrag dokumentieren): Inbox-Zero-Logik des Plugins; Durchstreichen lässt die Sektion unbegrenzt wachsen. *(Vom Nutzer bestätigt.)*
- **Datumslos = sofort fällig** (statt ignorieren): eine Erinnerung ohne Datum ist eine unerledigte Absicht — ignorieren würde sie erneut write-only machen. *(Vom Nutzer bestätigt.)*
- **Snooze-Presets wie bei Tasks** (statt nur ⌘T): identisches Muskelgedächtnis im selben Walk. *(Vom Nutzer bestätigt.)*
- **Kommando-Name „Vorgänge: Fällige Aufgaben durchgehen"** (Nutzer-Wahl): „Aufgaben" deckt Tasks und Erinnerungen ab; ID bleibt `task-triage-walk`.
- **Degradation statt Abbruch ohne TaskNotes**: Erinnerungen hängen nicht von TaskNotes ab; der harte availability-Abbruch würde das Feature grundlos blockieren.
- **Zeilen-Matching über exakten Zeilentext** (statt Zeilenindex): robust gegen Verschiebungen durch parallele Edits; bei Duplikaten trifft die erste Zeile (getestet, akzeptiertes degenerates Verhalten).
- **Eigenes `reminderOverdueLabel` statt Überladung von `overdueLabel`**: die bestehende Signatur ist `TriageTask`-gebunden (due-vor-scheduled-Präzedenz); ein Adapter-Fake-Task wäre unehrlicher als eine kleine eigene Funktion.
- **Preview = komplette Erinnerungen-Sektion ohne Hervorhebung**: KISS; die Sektion ist klein, eine Trim-/Highlight-Regel wäre spekulativ.
- **`mutateAndAdvance` bleibt unverändert**: die bestehende Signatur `(mutate, counter)` trägt Erinnerungs-Mutationen als Closure; das Handler-Branching auf `stop.kind` passiert davor.
- **Kein eigenes Kommando**: ein zweiter Walk-Befehl würde die Ein-Loop-Idee zerstören.

## Open Decisions

Keine.

## Out of Scope

- Wiederkehrende Erinnerungen und Erinnerungen mit Uhrzeit.
- System-Notifications außerhalb des Walks.
- CLI-Parität (`add-reminder` mit Datums-Argument) — separater kleiner Folgepunkt.
- Verknüpfung von Erinnerungen mit Vorgängen (Ablegen aus dem Tagebuch ist zurückgestellt).
- Ein eigenständiges Erinnerungs-Dashboard oder eine Anzeige außerhalb des Triage-Walks.
- Hervorhebung der aktuellen Erinnerungszeile in der Vorschau.
