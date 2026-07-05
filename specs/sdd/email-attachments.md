# SDD: E-Mail-Anhänge im Vault ablegen

Status: Ready for Implementation
Original: specs/sdd/email-attachments.md
Refined: 2026-07-05

## Overview

Beim Ablegen einer E-Mail (Posteingang-Walk und Einzel-Kommando) listet LuKit Anhänge bisher nur als Klartext-Zeile (`Anhänge: rechnung.pdf`); die Dateien selbst bleiben ausschließlich in Apple Mail erreichbar (`message://`-Link). Künftig werden die echten Anhänge der im Preview eingeschlossenen Nachrichten als Dateien im Vault gespeichert — im `_resources`-Unterverzeichnis des Ordners der Ziel-Vorgang-Notiz (bestehende Vault-Konvention) — und die `Anhänge:`-Zeile verlinkt sie als Wikilinks.

## Context & Constraints

- macOS/Apple Mail only (wie das gesamte E-Mail-Filing); Bridge = JXA via `osascript`, Werte als argv (nie interpoliert), `runJxa` sanitisiert stderr. Console-Logging PII-safe (nur Fehlertyp, nie Dateiname/Betreff).
- Bestehende Bausteine: `MailAttachment { name, mimeType, size }` (email-format-engine), `filterAttachments` (Inline-Bilder raus — bleibt unverändert die Vorstufe), `formatThreadSection`/`formatEmailSection` (bauen die `Anhänge:`-Zeile), `ThreadSectionMessage` (trägt `messageUrl`, aus dem die Message-ID per Decode rückgewinnbar ist — gleiche Mechanik wie `extractFiledMessageIds`), `commitThread` (Walk, archive-first) und `commitSelectedThread` (Einzel-Kommando, capture-only) in `email-filing-feature.ts`, `JXA_HELPERS`/`lukitFindInInbox` (mail-bridge).
- Zielpfad-Konvention (Nutzer-Entscheidung): `<Ordner der Vorgang-Notiz>/_resources/<dateiname>` — **kein neues Setting**, immer aktiv. Ordner wird bei Bedarf angelegt.
- Nur Anhänge der im Preview **eingeschlossenen** Nachrichten werden gespeichert (abgewählte Nachrichten: weder Inhalt noch Anhänge); gilt für **beide** Kommandos (Walk + „In Mail ausgewählte Nachricht ablegen").
- Nicht heruntergeladene Anhänge (IMAP lazy / offline) können beim JXA-Save scheitern → pro Datei auf den bisherigen Klartext-Namen degradieren, Walk läuft weiter.
- Desktop-only Pfadzugriff: absoluter Zielpfad via `(app.vault.adapter as FileSystemAdapter).getBasePath()` (Plugin ist ohnehin desktop-only durch den `child_process`-Import in `mail-bridge.ts`; kein `instanceof`-Guard nötig — siehe Decision Log).
- Die Message-Suche für `saveAttachments` betrifft immer genau **eine** Nachricht (kein Bulk-Scan wie bei `listInbox`); der Perf-Fix, der für `listInbox`/`getAllTaskPaths` nötig war, gilt hier nicht — Inbox-zuerst-dann-alle-Postfächer ist für einen Einzel-Lookup unkritisch.
- Tests: pure Logik in `tests/unit/`, Feature-Flüsse mit `fakeBridge()`-Doubles in `tests/acceptance/` bzw. `tests/sdd_email-attachments/` (eine Datei pro Kriterium). Kein PII in Fixtures (Acme, `rechnung.pdf`-artige generische Namen).

## Architecture

- **Bridge (impur)**: neues JXA-Skript `SAVE_ATTACHMENTS_JS` + Bridge-Methode `saveAttachments(accountName, messageId, items: { attachmentName: string; destPath: string }[]): Promise<string[]>` — findet die Nachricht via neuem Helper `lukitFindMessageAnywhere` (Inbox zuerst via `lukitFindInInbox`, sonst alle Postfächer des Kontos via `whose({ messageId })`, da das Einzel-Kommando auch Gesendet-Nachrichten abdeckt), speichert jeden benannten Anhang via `attachment.save({ in: Path(destPath) })`; pro Anhang ein try/catch, Rückgabe der erfolgreich gespeicherten `attachmentName`s. `destPath` ist pro Item bereits der volle absolute Zielpfad (inkl. aufgelöstem Dateinamen) — die Bridge kennt den Vault nicht und berechnet keine Pfade.
- **Pure Engine** (`email-format-engine.ts`):
  1. `resolveAttachmentFileNames(existingNames: Set<string>, attachmentNames: string[]): { original: string; resolved: string }[]` — Kollisionsauflösung gegen bereits vorhandene Dateien UND innerhalb des Batches (positionale Paare, da ein `Map<string,string>` Mehrfach-Originale wie `["a.pdf","a.pdf"]` nicht abbilden kann). Vergleich case-insensitive (APFS-Semantik); Suffix ` 2`, ` 3`, … wird vor dem **letzten** `.` eingefügt (`archiv.tar.gz` → `archiv.tar 2.gz`; kein Punkt vorhanden oder Punkt an Position 0 → Suffix ans Ende: `README` → `README 2`). Bestehende Dateien werden nie überschrieben.
  2. `decodeMessageIdFromUrl(url: string): string | null` — extrahiert und decodiert die Message-ID aus einem `message://%3C…%3E`-Link (faktorisiert aus der Regex/Decode-Logik, die `extractFiledMessageIds` bereits pro Fundstelle anwendet; `extractFiledMessageIds` ruft diese Funktion künftig intern auf).
  3. Erweiterung der `Anhänge:`-Zeile: `ThreadSectionMessage` erhält ein neues optionales Feld `savedNames?: Map<string, string>` (Original-Dateiname → gespeicherter Dateiname, nur für tatsächlich gespeicherte Anhänge). `formatEmailSection` erhält einen neuen optionalen 5. Parameter `savedNames?: Map<string, string>` (gleiche Semantik). Ein gemeinsamer interner Helper baut die Zeile: Anhänge mit Eintrag in `savedNames` werden `[[<gespeicherter Name>]]`, alle anderen bleiben Klartext (Original-Name) — gemischt in einer Zeile, Reihenfolge der Anhänge unverändert.
- **Feature-Fluss** (in `commitThread` nach Archiv+Verify, vor dem Vorgang-Schreiben; analog in `commitSelectedThread`, dort ohne Archivierung):
  1. Zielordner ableiten: `resourcesFolderPath = (targetFile.parent?.path ? targetFile.parent.path + "/" : "") + "_resources"` (vault-relativ).
  2. Ordner sicherstellen: `if (!(await vault.adapter.exists(normalizePath(resourcesFolderPath)))) await vault.adapter.mkdir(normalizePath(resourcesFolderPath))` — mkdir nur bei Abwesenheit (Idempotenz explizit per Existenzprüfung); `normalizePath` um alle adapter-Pfade, wie im besprechung-feature-Präzedenzfall.
  3. Bestandsnamen lesen: `existingNames = new Set((await vault.adapter.list(resourcesFolderPath)).files.map(p => p.split("/").pop()!))`.
  4. Pro eingeschlossener Nachricht mit (nach `filterAttachments` verbleibenden) Anhängen, in Nachrichten-Reihenfolge des Threads: Namen mit `resolveAttachmentFileNames(existingNames, filtered.map(a => a.name))` auflösen; jeden `resolved`-Namen sofort in `existingNames` einfügen, bevor die nächste Nachricht aufgelöst wird (verhindert Kollisionen zwischen zwei Anhängen gleichen Namens in verschiedenen Nachrichten desselben Threads).
  5. Zielpfade bilden: `resolveAttachmentDestPath(app, resourcesFolderPath, resolvedName)` → absoluter Pfad via `(app.vault.adapter as FileSystemAdapter).getBasePath()` + `path.join(basePath, resourcesFolderPath, resolvedName)`.
  6. Message-ID der Nachricht mit `decodeMessageIdFromUrl(msg.messageUrl)` ermitteln; Konto = `accountName` des Threads (Walk) bzw. `SelectedMessage.accountName` (Einzel-Kommando, bereits vorhandenes Feld).
  7. `bridge.saveAttachments(accountName, messageId, items)` aufrufen (`items` = `{attachmentName: original, destPath}[]`); bei Wurf: gesamte Nachricht behält Klartext-Namen (keine `savedNames`-Einträge).
  8. Aus der Rückgabeliste (nur erfolgreich gespeicherte `attachmentName`s) `msg.savedNames` als `Map<original, resolved>` befüllen (nur für die bestätigten Namen); nicht bestätigte Namen bleiben ohne Eintrag → Klartext in der Formatierung.
  9. `savedNames` an `formatThreadSection`/`formatEmailSection` weiterreichen wie oben beschrieben.
  Jeder Fehler in Schritten 2, 6 oder 7 degradiert nur die betroffenen Anhänge auf Klartext, niemals Abbruch des Filings.

## Requirements

1. Die Bridge shall eine Methode `saveAttachments(accountName: string, messageId: string, items: { attachmentName: string; destPath: string }[]): Promise<string[]>` bereitstellen (Rückgabe: erfolgreich gespeicherte `attachmentName`s); Nachrichtssuche via `lukitFindMessageAnywhere` — Inbox zuerst, dann alle Postfächer des Kontos; pro Anhang isoliertes try/catch im JXA.
2. Eine pure Funktion `resolveAttachmentFileNames(existingNames: Set<string>, attachmentNames: string[]): { original: string; resolved: string }[]` shall Kollisionen mit Suffix ` 2`, ` 3`, … vor dem letzten `.` auflösen — gegen bestehende Dateien (case-insensitiver Vergleich) und innerhalb desselben Aufrufs, wobei bereits im selben Aufruf aufgelöste Namen nachfolgende Kollisionen blockieren; bestehende Dateien werden nie überschrieben.
   2a. **Sanitisierung (Path-Traversal-Schutz)**: Anhang-Namen sind absender-kontrolliert. `resolveAttachmentFileNames` shall jeden Namen VOR der Kollisionsauflösung auf seinen Basename reduzieren (alles bis zum letzten `/` oder `\` verwerfen); ist das Ergebnis leer oder besteht es nur aus Punkten (`""`, `"."`, `".."`), wird der Fallback-Name `Anhang` verwendet. `original` im Rückgabepaar bleibt der unveränderte Eingabename (Schlüssel für `savedNames`/Klartext); `resolved` ist stets sanitisiert — `destPath` darf `_resources` nie verlassen.
3. Gespeichert wird in `<Ordner der Ziel-Vorgang-Notiz>/_resources/`; der Ordner shall bei Bedarf (Existenzprüfung vor `mkdir`) angelegt werden. Kein neues Setting.
4. Nur Anhänge der im Preview eingeschlossenen Nachrichten shall gespeichert werden; ausgeschlossene Nachrichten tragen weder Inhalt noch Anhänge bei. Inline-Bilder bleiben wie bisher gefiltert (`filterAttachments` läuft im Feature vor dem Aufbau der Namensliste für `resolveAttachmentFileNames`).
5. Die `Anhänge:`-Zeile shall gespeicherte Anhänge als Wikilink (`[[<dateiname>]]`, gespeicherter Name inkl. Kollisions-Suffix) listen und nicht gespeicherte weiterhin als Klartext (Original-Name) — gemischt in einer Zeile, Reihenfolge unverändert. Gilt für `formatThreadSection` (über `ThreadSectionMessage.savedNames`) und `formatEmailSection` (über den neuen `savedNames`-Parameter) gleichermaßen.
6. Save-Fehler (einzelner Anhang, ganzer Bridge-Call, Ordner nicht anlegbar oder Nachricht nicht auffindbar) shall pro betroffener Nachricht auf Klartext-Namen degradieren; das Filing (Archivierung + Vorgang-Schreiben) läuft unverändert weiter. Console-Log nur Fehlertyp (PII-safe).
7. Beide Kommandos shall das Verhalten teilen: `email-filing-walk` (commitThread) und `email-filing-file-selected` (commitSelectedThread).
8. Die Message-ID pro Thread-Nachricht shall aus deren `messageUrl` mittels `decodeMessageIdFromUrl` decodiert werden; das Konto ist `accountName` des Threads (Walk) bzw. `SelectedMessage.accountName` (Einzel-Kommando). Semantik von `decodeMessageIdFromUrl` (Parität mit der heutigen Inline-Logik von `extractFiledMessageIds`): kein Regex-Match → `null`; Match, aber `decodeURIComponent` wirft → die **rohe** captured id (nicht `null`).
9. Die Read-only-Header im `EmailPreviewModal` (inkl. `Anhänge:`-Zeile) bleiben unverändert — die Wikilink-Ersetzung passiert erst beim Schreiben in den Vorgang.
10. `existingNames` shall über den gesamten `commitThread`/`commitSelectedThread`-Aufruf pro Zielnotiz akkumuliert werden: nach der Namensauflösung jeder Nachricht werden ihre `resolved`-Namen in das Set eingefügt, bevor die nächste Nachricht im selben Filing-Vorgang aufgelöst wird.

## File & Module Structure

- `src/features/email-filing/mail-bridge.ts` — neu: `SAVE_ATTACHMENTS_JS`, `lukitFindMessageAnywhere`-Helper (Inbox-zuerst via `lukitFindInInbox`, dann alle Postfächer via `whose({messageId})`), `saveAttachments` im `MailBridge`-Interface (mit `/** … */`-Doc-Kommentar im Stil der bestehenden Methoden: Fehlervertrag, Rückgabesemantik) + `createOsascriptBridge`.
- `esbuild.config.mjs` — `"path"` zum `external`-Array ergänzen (gleiche Behandlung wie `child_process`, Kommentar analog) — ohne diesen Eintrag bricht der Bundle-Build des Plugins.
- `src/features/email-filing/email-format-engine.ts` — neu: `resolveAttachmentFileNames`, `decodeMessageIdFromUrl`; `ThreadSectionMessage` erhält `savedNames?: Map<string, string>`; `formatEmailSection` erhält 5. Parameter `savedNames?: Map<string, string>`; gemeinsamer interner Helper für die Anhänge-Zeile; `extractFiledMessageIds` ruft `decodeMessageIdFromUrl` intern auf (Refactor ohne Verhaltensänderung).
- `src/features/email-filing/email-filing-feature.ts` — Save-Schritt in `commitThread` und `commitSelectedThread`; neuer Helper `resolveAttachmentDestPath(app: App, vaultRelativeFolder: string, fileName: string): string`; `_resources`-Pfad-Ableitung + Existenzprüfung + mkdir; Message-ID-Decode.
- `tests/sdd_email-attachments/` — Kriterien-Tests; `fakeBridge()` erhält ein `saveAttachments`-Double.
- `tests/helpers/obsidian-mocks.ts` — `MockVault` erhält einen `adapter`-Stub (`exists`, `mkdir`, `list`, `getBasePath`) — heute nicht vorhanden, ohne ihn sind die Phase-2-Szenarien (mkdir/destPath) nicht schreibbar.
- README.md + CLAUDE.md — Verhalten dokumentieren.

## Data Models

```typescript
// mail-bridge.ts — MailBridge interface addition
saveAttachments(
  accountName: string,
  messageId: string,
  items: { attachmentName: string; destPath: string }[],
): Promise<string[]>; // attachmentNames of items saved successfully

// email-format-engine.ts
export function resolveAttachmentFileNames(
  existingNames: Set<string>,
  attachmentNames: string[],
): { original: string; resolved: string }[];

export function decodeMessageIdFromUrl(url: string): string | null;

export interface ThreadSectionMessage {
  direction: "in" | "out";
  partyName: string;
  dateSent: string;
  body: string;
  attachments: MailAttachment[];
  messageUrl: string;
  savedNames?: Map<string, string>; // original attachment name -> saved filename
}

export function formatEmailSection(
  meta: EmailMeta,
  body: string,
  attachments: MailAttachment[],
  locale: DateLocale,
  savedNames?: Map<string, string>,
): { sectionName: string; bodyLines: string[] };

// email-filing-feature.ts
function resolveAttachmentDestPath(
  app: App,
  vaultRelativeFolder: string,
  fileName: string,
): string; // absolute filesystem path via (app.vault.adapter as FileSystemAdapter).getBasePath()
```

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Anhang nicht speicherbar | nicht heruntergeladen / JXA-Save wirft | Name fehlt in Rückgabeliste → kein `savedNames`-Eintrag → Klartext-Name in der Anhänge-Zeile | keine (Zeile zeigt Klartext statt Link) |
| Ganzer saveAttachments-Call wirft | osascript-Fehler | alle Namen der Nachricht bleiben Klartext, Filing läuft weiter | keine |
| `_resources` nicht anlegbar | `adapter.mkdir` wirft | kein Save-Versuch für die betroffene(n) Nachricht(en), alle Namen bleiben Klartext | keine |
| Nachricht nicht auffindbar | zwischen Archiv und Save verschoben | Bridge liefert leere Liste `[]` | keine |

## Phase 1 — Bridge und pure Engine

`saveAttachments` (JXA + Bridge-Interface + osascript-Implementierung inkl. `lukitFindMessageAnywhere`), `resolveAttachmentFileNames`, `decodeMessageIdFromUrl`, `savedNames`-Erweiterung von `ThreadSectionMessage` und `formatEmailSection`.

Phase complete when: Unit-Tests unten grün; `npm run test` und `npm run build` grün. (Das JXA-Skript selbst ist nur live testbar — der Bridge-Vertrag wird über das Interface + fakeBridge gepinnt.)

### Test Scenarios

- GIVEN existierende Dateien `{"rechnung.pdf"}` und Anhänge `["rechnung.pdf", "foto.jpg"]` WHEN `resolveAttachmentFileNames` läuft THEN liefert es `[{original: "rechnung.pdf", resolved: "rechnung 2.pdf"}, {original: "foto.jpg", resolved: "foto.jpg"}]`.
- GIVEN zwei gleichnamige Anhänge im selben Aufruf (`["a.pdf", "a.pdf"]`, keine Bestandsdateien) WHEN aufgelöst wird THEN ergibt sich `[{original: "a.pdf", resolved: "a.pdf"}, {original: "a.pdf", resolved: "a 2.pdf"}]` (Batch-interne Kollision).
- GIVEN ein Anhang ohne Extension (`"README"`) mit Bestandskollision WHEN aufgelöst wird THEN lautet das Ergebnis `resolved: "README 2"` (Suffix ans Ende).
- GIVEN ein mehrteiliger Dateiname (`"archiv.tar.gz"`) mit Bestandskollision WHEN aufgelöst wird THEN lautet das Ergebnis `resolved: "archiv.tar 2.gz"` (Suffix vor dem letzten `.`).
- GIVEN eine Bestandsdatei `"Invoice.PDF"` und ein Anhang `"invoice.pdf"` WHEN aufgelöst wird THEN kollidiert er case-insensitiv und ergibt `resolved: "invoice 2.pdf"`.
- GIVEN ein Anhang mit Traversal-Namen (`"../../evil.pdf"` bzw. `"foo/bar.pdf"` bzw. `"..\\evil.pdf"`) WHEN aufgelöst wird THEN enthält `resolved` keinerlei Pfadtrenner oder `..`-Segmente (`"evil.pdf"` / `"bar.pdf"` / `"evil.pdf"`), `original` bleibt der Eingabename.
- GIVEN ein Anhang, dessen Basename leer oder nur Punkte ist (`"docs/"`, `".."`) WHEN aufgelöst wird THEN lautet `resolved` der Fallback `"Anhang"` (bei Kollision `"Anhang 2"`).
- GIVEN eine Nachricht mit `savedNames`-Map `{rechnung.pdf → "rechnung 2.pdf"}` und einem ungespeicherten `foto.jpg` WHEN `formatThreadSection` rendert THEN lautet die Zeile `Anhänge: [[rechnung 2.pdf]], foto.jpg` (Reihenfolge unverändert).
- GIVEN dieselbe `savedNames`-Situation WHEN `formatEmailSection` (Einzelnachricht) mit dem neuen 5. Parameter rendert THEN zeigt es identisches Mischverhalten `Anhänge: [[rechnung 2.pdf]], foto.jpg`.
- GIVEN keine `savedNames`-Map/kein 5. Parameter WHEN `formatThreadSection` **und** `formatEmailSection` rendern THEN ist die Ausgabe byte-identisch zum heutigen Verhalten (Regressions-Pin für beide Funktionen).
- GIVEN ein `saveAttachments`-Aufruf mit zwei Items WHEN die JXA-Implementierung pro Item ein try/catch durchläuft und ein Item wirft THEN enthält die Rückgabeliste nur den `attachmentName` des erfolgreichen Items (Bridge-Vertrag über `fakeBridge`, kein osascript nötig).

## Phase 2 — Feature-Integration (Walk + Einzel-Kommando)

Save-Schritt in `commitThread`/`commitSelectedThread`: `_resources`-Ableitung, Existenzprüfung + mkdir, Namensauflösung gegen Ordnerinhalt (über Nachrichten hinweg akkumuliert), Bridge-Call, `savedNames` in die Formatierung; Degradation bei Fehlern; Doku.

Phase complete when: Akzeptanz-Szenarien unten grün; README/CLAUDE.md aktualisiert; `npm run test` und `npm run build` grün; manueller Smoke-Test (echtes Postfach) im Report als offen vermerkt.

### Test Scenarios

- GIVEN ein Thread mit einer eingeschlossenen Nachricht mit Anhang und `fakeBridge.saveAttachments` bestätigt den Namen WHEN `commitThread` läuft THEN enthält der Vorgang `Anhänge: [[rechnung.pdf]]`.
- GIVEN `saveAttachments` wird aufgerufen WHEN der Zielpfad übergeben wird THEN ist `destPath` ein absoluter Pfad (`(app.vault.adapter as FileSystemAdapter).getBasePath()` + `_resources/<dateiname>`), nicht vault-relativ.
- GIVEN eine im Preview ausgeschlossene Nachricht mit Anhang WHEN `commitThread` läuft THEN wird für sie kein `saveAttachments`-Aufruf ausgelöst.
- GIVEN `fakeBridge.saveAttachments` wirft (ganzer Call) WHEN `commitThread` läuft THEN wird der Vorgang trotzdem geschrieben und die Zeile zeigt den Klartext-Namen.
- GIVEN `saveAttachments` bestätigt nur einen von zwei Anhängen WHEN `commitThread` läuft THEN mischt die Zeile Wikilink und Klartext.
- GIVEN das Einzel-Kommando (`commitSelectedThread`, capture-only) mit Anhang WHEN es läuft THEN wird gespeichert und verlinkt wie im Walk (Konto aus `SelectedMessage.accountName`), aber es wird weiterhin nichts archiviert.
- GIVEN eine Nachricht ohne Anhänge WHEN gefiled wird THEN erfolgt kein Bridge-Call und keine Anhänge-Zeile (unverändertes Verhalten).
- GIVEN der `_resources`-Ordner der Zielnotiz existiert noch nicht WHEN `commitThread` läuft THEN wird `adapter.mkdir` für diesen Pfad aufgerufen, bevor `saveAttachments` aufgerufen wird.
- GIVEN der `_resources`-Ordner existiert bereits WHEN `commitThread` läuft THEN wird `adapter.mkdir` **nicht** aufgerufen (Existenzprüfung greift) und `saveAttachments` läuft normal weiter.
- GIVEN die Nachricht ist zwischen Archivierung und Save nicht mehr auffindbar (`fakeBridge.saveAttachments` liefert `[]`) WHEN `commitThread` läuft THEN degradieren alle Anhänge der Nachricht zu Klartext und das Filing schließt normal ab.
- GIVEN zwei verschiedene Nachrichten desselben Threads tragen je einen Anhang mit identischem Namen (`"rechnung.pdf"`) WHEN `commitThread` läuft THEN wird der zweite Anhang zu `"rechnung 2.pdf"` aufgelöst (thread-übergreifende Akkumulation von `existingNames`), und beide werden mit unterschiedlichen `destPath`s an `saveAttachments` übergeben.

## Decision Log

- **`_resources` neben der Zielnotiz statt Setting-Ordner oder Obsidian-Attachment-Ordner**: bestehende Vault-Konvention des Nutzers; kein neues Setting, immer aktiv. *(Vom Nutzer festgelegt.)*
- **Nur eingeschlossene Nachrichten, beide Kommandos**: wer eine Noise-Mail abwählt, will auch deren Anhang nicht; Einzel-Kommando verhält sich identisch. *(Vom Nutzer bestätigt.)*
- **Kollisions-Suffix ` 2` statt Überschreiben oder Hash-Namen**: nie Datenverlust, lesbare Namen; `_resources` wird von allen Notizen des Ordners geteilt.
- **Degradation statt Abbruch**: Offline-/Lazy-IMAP-Anhänge dürfen das Inbox-Zero-Filing nicht stoppen; der `message://`-Link bleibt der Recovery-Pfad.
- **Wikilink-Ersetzung erst beim Schreiben, Preview unverändert**: die Preview-Header sind read-only, damit `message://`-Links nie kaputt editiert werden — gleiche Logik gilt für die Anhänge-Zeile.
- **Zielpfade als argv an die Bridge**: die Bridge kennt den Vault nicht; das Feature berechnet absolute Pfade (`FileSystemAdapter.getBasePath()`), JXA speichert nur.
- **Kein Nachzieh-Kommando für Alt-Ablagen**: verworfen zugunsten des integrierten Speicherns (Diskussion 2026-07-05); bei Bedarf später.
- **`resolveAttachmentFileNames` gibt positionale `{original, resolved}`-Paare statt einer `Map<string,string>` zurück**: eine Map kann Mehrfach-Originale (`["a.pdf","a.pdf"]`) nicht abbilden; Paare bewahren die Eingabereihenfolge.
- **`existingNames` wird über den gesamten Filing-Vorgang (alle Nachrichten eines Threads) akkumuliert**, nicht nur einmal von der Festplatte gelesen: verhindert Kollisionen zwischen gleichnamigen Anhängen verschiedener Nachrichten desselben Threads.
- **Kollisionsvergleich case-insensitiv**: entspricht APFS-Semantik (case-insensitive, case-preserving); der aufgelöste Name behält seine ursprüngliche Schreibweise.
- **Suffix vor dem letzten `.`**: einzige eindeutige Regel für sowohl einfache (`rechnung.pdf`) als auch mehrteilige Extensions (`archiv.tar.gz`); ohne Punkt (oder Punkt an Position 0) ans Ende.
- **Kein `instanceof FileSystemAdapter`-Guard**: das Plugin ist bereits durch den `child_process`-Import in `mail-bridge.ts` desktop-only erzwungen; der Cast auf `FileSystemAdapter` erfolgt ungeprüft, analog zum bestehenden Muster im Rest des Features.
- **`_resources`-Existenzprüfung vor `mkdir`** statt Verlass auf mkdir-Idempotenz: `adapter.exists` + bedingtes `adapter.mkdir` ist explizit und plattformunabhängig getestet, statt sich auf ein ungeprüftes Fehlerverhalten bei bereits vorhandenem Ordner zu verlassen.
- **`decodeMessageIdFromUrl` als eigene exportierte Funktion**, aus der bisherigen Inline-Logik von `extractFiledMessageIds` faktorisiert: eine Stelle für die Decode-Regel, die sowohl für die Bestandsermittlung (Alt-Filing) als auch für den neuen Save-Schritt gebraucht wird.
- **Kein Perf-Sonderpfad für `saveAttachments`-Nachrichtensuche**: anders als `listInbox`/`getAllTaskPaths` (Bulk-Scans) sucht `saveAttachments` genau eine Nachricht pro Aufruf; Inbox-zuerst-dann-alle-Postfächer ist dafür unkritisch.
- **`savedNames` als Feld auf `ThreadSectionMessage` statt separater Parallel-Map**: hält die Zuordnung Nachricht↔gespeicherte-Namen lokal bei der Nachricht, kein zusätzlicher Index nötig.
- **Basename-Sanitisierung in `resolveAttachmentFileNames` statt im Feature** *(Validate-Finding 2026-07-05)*: Anhang-Namen sind absender-kontrolliert (Path-Traversal-Risiko via `../../…`); die Sanitisierung sitzt in der puren Funktion, damit sie unit-testbar ist und kein Aufrufer sie vergessen kann.
- **`"path"` in die esbuild-externals** *(Validate-Finding)*: der Plugin-Bundle ist nicht `platform: "node"`; Node-Builtins müssen wie `child_process` explizit externalisiert werden.

## Open Decisions

Keine.

## Out of Scope

- Nachträgliches Anhang-Speichern für bereits abgelegte E-Mails (Alt-Bestand).
- HTML→Markdown-Konvertierung der Bodies (weiterhin v2-Thema des E-Mail-Filings).
- Inline-Bilder (bleiben gefiltert, werden nicht gespeichert).
- Größenlimits/Quota für `_resources`.
- Aufräumen von `_resources` beim Abschließen/Mergen eines Vorgangs.
