# SDD: Entscheidungen aus Besprechungen in Vorgänge routen

Status: Ready for Implementation
Original: specs/sdd/besprechung-entscheidungen.md
Refined: 2026-07-29

## Overview

Granola-Besprechungsnotizen enthalten jetzt eine zusätzliche Section `# Entscheidungen`. Diese Section wird künftig wie `Nächste Schritte`/`Zusammenfassung` in die datierte h5-Sektion des Ziel-Vorgangs übernommen **und zusätzlich** als gruppiertes, verlinktes Bullet unter `# Fakten und Pointer` protokolliert — damit ein Vorgang ein nachschlagbares Entscheidungslog bekommt, ohne dass man sich durch die Chronologie der h5-Sektionen wühlen muss.

Weil Granola die Section nur bei tatsächlich getroffenen Entscheidungen emittiert, braucht es zusätzlich das Konzept „optionale Überschrift": eine fehlende Entscheidungs-Section darf nicht als `missing` gelten und keine `→ See full notes …`-Zeile auslösen.

## Context & Constraints

- Stack: TypeScript strict, Obsidian-Plugin, Vitest. Build `npm run build`, Tests `npm run test`.
- Feature-Pattern: `<name>-engine.ts` = pure Logik ohne Obsidian-Imports, `<name>-feature.ts` = Obsidian-API. Neue Logik gehört in die Engines, nicht in die Feature-Klassen.
- UI/Notices/Settings sind durchgehend deutsch; Section-Namen deutsch (`Fakten und Pointer`, `Inhalt`).
- Kein PII in Tests/Fixtures — fiktive Platzhalter (`Max Mustermann`, `Acme`, `Musterstadt`).
- Bestehende Struktur laut `examples/new/example-new-vorgang.md`: Unterbullets mit **4 Leerzeichen**; `# Inhalt`-TOC und h5-Sektionen sind **reverse-chronologisch** (neueste oben).
- Betroffene Ablage-Pfade in `besprechung-feature.ts` (beide müssen das Routing erhalten):
  1. `insertBesprechungSummary` (Cursor-Einfügung, editorbasiert via `editor.setValue`)
  2. `fileBesprechungIntoVorgang` (Walk „Alle offenen ablegen" + Single-Shot „Aktuelle Notiz ablegen", via `vault.modify`)
- Beide Pfade transformieren einen kompletten Content-String → das Fakten-Routing kann als reiner Engine-Transform implementiert und in beiden Pfaden identisch angewandt werden.
- E-Mail-Ablage ist ausdrücklich **nicht** betroffen (E-Mails haben keine Entscheidungs-Section).
- Besprechungs-Basenames werden — wie an allen bestehenden Wikilink-Call-Sites (`addVorgangSectionLinked`, TOC-Einträge) — roh in `[[…]]` eingebettet. Die Annahme, dass ein Basename kein `]]` und keinen Zeilenumbruch enthält, gilt hier genauso; sie wird bewusst nicht neu abgesichert (systemisches Muster, keine Regression dieses Features).
- `mergeSettings` (`src/types.ts:84`) spreizt `DEFAULT_SETTINGS.besprechung` vor den gespeicherten Werten — ein Settings-Blob ohne `decisionHeadings` fällt automatisch auf den Default zurück. Es ist **keine** Migrationslogik zu schreiben.

## Requirements

1. Das System stellt ein Setting `besprechung.decisionHeadings: string[]` mit Default `["Entscheidungen"]` bereit, das in der Settings-UI als kommagetrenntes Textfeld editierbar ist. Das Parsing folgt exakt der bestehenden `sectionHeadings`-Logik in `besprechung-settings.ts`: `value.split(",").map(s => s.trim()).filter(s => s.length > 0)`. Keine Deduplizierung (konsistent mit dem bestehenden Feld).
2. Das System behandelt jede Überschrift aus `decisionHeadings` als **optional**: fehlt sie in der Besprechung, erscheint sie nicht in `BesprechungSummary.missing` und löst keine `→ See full notes …`-Zeile aus.
3. Das System extrahiert Überschriften aus `decisionHeadings` weiterhin in den h5-Sektions-Body, sofern sie auch in `sectionHeadings` konfiguriert sind — das bestehende Extraktionsverhalten bleibt unverändert.
4. Das System hängt beim Ablegen bzw. Einfügen einer Besprechung, deren Entscheidungs-Section nicht leer ist, unter `# Fakten und Pointer` des Ziel-Vorgangs einen Block an:
   - Eltern-Bullet: `- Entscheidungen <Datum> ([[<Besprechungs-Basename>]])`, Datum im Format der `dateLocale`
   - je Entscheidungszeile ein Unterbullet mit 4 Leerzeichen Einrückung

   „Nicht leer" ist definiert als `extractDecisionLines(content, decisionHeadings).length > 0`.
5. Das System bewahrt die relative Verschachtelung der Zeilen des Entscheidungs-Bodys: bereits eingerückte Zeilen erhalten zusätzlich eine Ebene (4 Leerzeichen).
6. Das System wandelt nicht-Bullet-Zeilen des Entscheidungs-Bodys in Bullets um; Zeilen, die bereits mit `-` oder `*` beginnen, behalten ihre Marker; Leerzeilen werden verworfen.
7. Das System fügt einen neuen Entscheidungsblock **oberhalb des ersten bereits vorhandenen Entscheidungsblocks** innerhalb von `# Fakten und Pointer` ein; existiert keiner, wird am Ende der Section angehängt. Manuell gepflegte Fakten bleiben dadurch oben stehen, die Entscheidungsblöcke selbst sind reverse-chronologisch.
8. Das System hängt keinen Entscheidungsblock an, wenn `# Fakten und Pointer` im Ziel-Vorgang fehlt; die Entscheidungen landen in diesem Fall ausschließlich in der h5-Sektion.
9. Das System hängt keinen zweiten Entscheidungsblock für dieselbe Besprechung an, wenn unter `# Fakten und Pointer` bereits eine Zeile existiert, die **beide** Bedingungen erfüllt: sie beginnt mit dem literalen Präfix `- Entscheidungen ` **und** enthält `([[<Besprechungs-Basename>]])` (Idempotenz). Eine manuell geschriebene Zeile, die dieselbe Besprechung verlinkt, aber nicht mit diesem Präfix beginnt, blockiert **nicht**.
10. Das System schreibt Vorgangs-Content pro Ablage in genau einem Schreibvorgang (`vault.modify` bzw. `editor.setValue`) — h5-Sektion und Fakten-Block werden im selben Content-Transform erzeugt.
11. Das System lässt die E-Mail-Ablage (`email-filing`) unverändert.
12. Das System behandelt `decisionHeadings = []` (vom Nutzer geleerte Liste) so, dass `extractDecisionLines` `[]` liefert, der Fakten-Append ein No-Op ist, und keine Überschrift als optional behandelt wird.
13. Das Fakten-Log-Routing ist **unabhängig von `sectionHeadings`**: eine Überschrift, die nur in `decisionHeadings` steht (nicht in `sectionHeadings`), wird unter `# Fakten und Pointer` protokolliert, erscheint aber nicht im h5-Body. Dies ist beabsichtigtes Verhalten, kein Bug — es gibt keinen Cross-Check zwischen den beiden Settings.
14. Das Eltern-Bullet-Label ist das **fixe literale Wort `Entscheidungen`**, unabhängig vom Namen der konfigurierten Überschrift — es ist ein Konzept-Label, kein Section-Titel. Bei `decisionHeadings = ["Beschlüsse"]` lautet das Label weiterhin `Entscheidungen`.

## Architecture

```
besprechung-engine.ts (pure)
  formatBesprechungSummary(content, sectionHeadings, optionalHeadings)  ← erweitert
  extractDecisionLines(content, decisionHeadings) → string[]            ← neu

vorgang-engine.ts (pure)
  appendDecisionsToFakten(content, besprechungBasename, decisionLines,
                          locale, date) → { content: string; insertedLines: number }  ← neu

besprechung-feature.ts (Obsidian)
  insertBesprechungSummary      ─┐
  fileBesprechungIntoVorgang    ─┴─ addVorgangSectionLinked(...)
                                     → appendDecisionsToFakten(...)
                                     → ein Schreibvorgang
```

Der Fakten-Append läuft **nach** `addVorgangSectionLinked` auf dessen Ergebnis-Content. `addVorgangSectionLinked` liefert `cursorLineIndex`; da der Fakten-Block oberhalb der h5-Sektion eingefügt wird, muss der Index um `insertedLines` (aus `appendDecisionsToFakten`) korrigiert werden — nur relevant für den editorbasierten Pfad (`insertBesprechungSummary`). `insertedLines` ist `0`, wann immer der Content unverändert zurückgegeben wird (kein Fakten-Abschnitt, leere `decisionLines`, oder bereits verlinkt).

`extractDecisionLines` iteriert `decisionHeadings` in **Setting-Reihenfolge** (analog zu `formatBesprechungSummary` für `sectionHeadings`), sammelt die Zeilen aller gematchten Sections in dieser Reihenfolge in **eine flache Liste**, und die Ablage erzeugt daraus **genau ein** Eltern-Bullet pro Filing — nie eines pro Überschrift.

Die Extraktion selbst läuft über den bestehenden `extractSection(content, heading)` aus `besprechung-engine.ts:18-62` — **ohne** das `bulletsOnly`-Flag. Mit `bulletsOnly = true` bricht `extractSection` an der ersten Nicht-Bullet-Zeile ab; das würde Requirement 6 (Prosa-Zeilen zu Bullets *konvertieren*) unterlaufen und einen gemischten Body stillschweigend abschneiden. `extractSection` liefert `null` sowohl bei fehlender als auch bei nach Trim leerer Section — für Requirements 2 und 12 ist beides identisch zu behandeln („nicht vorhanden"), also ist diese Nicht-Unterscheidbarkeit hier korrekt und kein Grund für einen eigenen Scanner.

**Prior art für die Section-Grenzen:** `vorgang-engine.ts` enthält bereits `sliceSectionBody(lines, header)` (`vorgang-engine.ts:213-222`) und `mergeH1Section(content, header, newLines, createAfterHeader)` (`vorgang-engine.ts:262-302`); beide bestimmen die Grenzen einer h1-Section über den Boundary-Scan `/^#{1,5} /` bis zur nächsten Überschrift. `appendDecisionsToFakten` nutzt dasselbe Muster für die Grenzen von `# Fakten und Pointer` — der Scan ist **nicht neu herzuleiten**. Die Funktion bleibt dennoch eigenständig, weil sie in zwei Punkten bewusst von `mergeH1Section` abweicht: Platzierung oberhalb des ersten bestehenden Entscheidungsblocks statt Append am Section-Ende (Requirement 7), und No-Op statt Create-if-missing bei fehlender Section (Requirement 8).

Das Datum im Eltern-Bullet ist immer derselbe `date`-Wert, der für dieselbe Ablage bereits an `addVorgangSectionLinked` übergeben wird — h5-Header und Fakten-Bullet stimmen dadurch immer überein. Der Engine parst das Datum nie selbst aus dem Besprechungs-Content.

## File & Module Structure

| Datei | Änderung |
|---|---|
| `src/types.ts` | `BesprechungSettings.decisionHeadings: string[]`, Default `["Entscheidungen"]` |
| `src/features/besprechung/besprechung-settings.ts` | neues Setting-Textfeld „Entscheidungs-Überschriften" |
| `src/features/besprechung/besprechung-engine.ts` | `formatBesprechungSummary` um `optionalHeadings` erweitert; neu `extractDecisionLines` |
| `src/features/vorgang/vorgang-engine.ts` | neu `appendDecisionsToFakten` |
| `src/features/besprechung/besprechung-feature.ts` | beide Ablage-Pfade verdrahten, `decisionHeadings` durchreichen |
| `tests/unit/besprechung-engine.test.ts` | optionale Überschriften, `extractDecisionLines` |
| `tests/unit/vorgang-engine.test.ts` | `appendDecisionsToFakten` (Platzierung, Einrückung, Idempotenz, fehlende Section, mehrere Überschriften, leere `decisionHeadings`) |
| `tests/acceptance/besprechung-vault.test.ts` | Ende-zu-Ende Walk/Single-Shot (`vault.modify`): schreibt h5 **und** Fakten-Block in einem Write |
| `tests/acceptance/besprechung-feature.test.ts` | Ende-zu-Ende Editor-Pfad (`insertBesprechungSummary`): Fakten-Block + korrigierte Cursor-Position |
| `CLAUDE.md`, `README.md` | neues Setting + Verhalten dokumentieren |

## Data Models

```ts
// src/types.ts — BesprechungSettings (Auszug)
export interface BesprechungSettings {
	folderPath: string;
	sectionHeadings: string[];
	/** Überschriften, die als Entscheidungen gelten: optional (nie „missing")
	 *  und zusätzlich als Log unter „# Fakten und Pointer" protokolliert.
	 *  Unabhängig von sectionHeadings (siehe Requirement 13). */
	decisionHeadings: string[];
	pendingTag: string;
	pendingOrder: PendingOrder;
	selfNameStopwords: string[];
}
```

```ts
// besprechung-engine.ts
export function formatBesprechungSummary(
	content: string,
	sectionHeadings?: string[],
	optionalHeadings?: string[],
): BesprechungSummary;

/** Sammelt die Zeilen aller `decisionHeadings`-Sections in Setting-Reihenfolge
 *  zu einer flachen Liste (siehe Architecture). Nutzt `extractSection` ohne
 *  `bulletsOnly`. Leerzeilen verworfen, Nicht-Bullet-Zeilen zu `- <Text>`
 *  normalisiert. */
export function extractDecisionLines(
	content: string,
	decisionHeadings: string[],
): string[];

// buildBesprechungFilingPreview bleibt unverändert — siehe AMENDMENT unten.
```

```ts
// vorgang-engine.ts
/** date: derselbe Wert, der für diese Ablage an addVorgangSectionLinked
 *  übergeben wird — nie aus dem Besprechungs-Content geparst. */
export function appendDecisionsToFakten(
	content: string,
	besprechungBasename: string,
	decisionLines: string[],
	locale: DateLocale,
	date: Date,
): { content: string; insertedLines: number };
```

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| `# Fakten und Pointer` fehlt | Vorgang ohne Skelett | Fakten-Append wird übersprungen (`insertedLines: 0`), h5-Sektion wird normal geschrieben | nein (bewusst still) |
| Entscheidungs-Section leer/fehlt | Besprechung ohne Entscheidungen | kein Fakten-Block, kein `missing`-Eintrag | nein |
| Besprechung bereits im Fakten-Log | erneute Ablage derselben Besprechung (Präfix-Match Req 9) | Append wird übersprungen (`insertedLines: 0`) | nein |
| `decisionHeadings = []` | Nutzer hat Setting geleert | `extractDecisionLines` liefert `[]`, Fakten-Append No-Op | nein |
| Schreibfehler `vault.modify` | I/O | bestehendes Verhalten unverändert (Notice, Pending-Tag bleibt) | ja, deutsche Notice |

## Implementation Phases

## Phase 1 — Optionale Überschriften + Setting

`decisionHeadings` in `types.ts` + `DEFAULT_SETTINGS` + Settings-UI (Parsing exakt wie `sectionHeadings`, siehe Requirement 1). `formatBesprechungSummary` bekommt einen dritten Parameter `optionalHeadings`; darin enthaltene Überschriften landen bei Nichtvorhandensein nicht in `missing`. Beide Ablage-Pfade reichen `decisionHeadings` als `optionalHeadings` durch.

Nach dieser Phase kann der Nutzer `Entscheidungen` zu `sectionHeadings` hinzufügen, ohne dass entscheidungsfreie Besprechungen eine `(missing: Entscheidungen)`-Zeile bekommen.

Phase complete when: `npm run test` grün, `npm run build` grün, und ein Vorgang mit `Entscheidungen` in `sectionHeadings` + `decisionHeadings` bei einer Besprechung ohne diese Section eine Einfügung ohne `→ See full notes`-Zeile erzeugt.

### Test Scenarios

- GIVEN `sectionHeadings = ["Entscheidungen","Zusammenfassung"]`, `optionalHeadings = ["Entscheidungen"]` und eine Besprechung ohne `# Entscheidungen`, aber mit `# Zusammenfassung` WHEN `formatBesprechungSummary` läuft THEN ist `missing` leer.
- GIVEN dieselbe Konfiguration und eine Besprechung ohne `# Entscheidungen` **und** ohne `# Zusammenfassung` WHEN `composeBesprechungInsertion` läuft THEN nennt die `→ See full notes`-Zeile ausschließlich `Zusammenfassung`.
- GIVEN eine Besprechung **mit** `# Entscheidungen` WHEN `formatBesprechungSummary` läuft THEN enthält der Body weiterhin einen `**Entscheidungen**`-Block in der Reihenfolge von `sectionHeadings` (unverändert).
- GIVEN eine Überschrift steht in `decisionHeadings`, aber nicht in `sectionHeadings` WHEN `formatBesprechungSummary` läuft THEN wird sie nicht in den h5-Body extrahiert und nicht als `missing` gemeldet (siehe Requirement 13 — das Fakten-Log-Routing in Phase 2/3 bleibt davon unberührt).
- GIVEN Default-Settings WHEN das Plugin lädt THEN ist `decisionHeadings === ["Entscheidungen"]`.
- GIVEN ein gespeichertes Settings-Blob ohne `decisionHeadings` WHEN `mergeSettings` läuft THEN ist `decisionHeadings === ["Entscheidungen"]` und nicht `undefined`.
- GIVEN eine Besprechung ohne `# Entscheidungen` WHEN `buildBesprechungFilingPreview` läuft THEN besteht die Vorschau ausschließlich aus dem Body (die Funktion rendert `missing` nie — siehe AMENDMENT).

## Phase 2 — Engine: Entscheidungs-Extraktion und Fakten-Append

`extractDecisionLines` (besprechung-engine) liefert die normalisierten Zeilen aller `decisionHeadings`-Sections, in Setting-Reihenfolge zu einer flachen Liste zusammengeführt (Requirement 4, Architecture). `appendDecisionsToFakten` (vorgang-engine) fügt den gruppierten Block gemäß Requirements 4–9, 12 ein und liefert `{ content, insertedLines }`. Beide rein, ohne Obsidian-Imports, voll unit-getestet.

Phase complete when: `npm run test` grün mit vollständiger Branch-Abdeckung beider neuer Funktionen; keine Verdrahtung im Feature (noch keine Verhaltensänderung im Plugin).

### Test Scenarios

- GIVEN eine Besprechung mit `# Entscheidungen` und drei Bullets WHEN `extractDecisionLines` läuft THEN liefert sie drei Zeilen, Leerzeilen verworfen.
- GIVEN ein Entscheidungs-Body mit einer nicht-Bullet-Zeile WHEN `extractDecisionLines` läuft THEN ist die Zeile als `- <Text>` normalisiert.
- GIVEN ein Entscheidungs-Body, in dem eine Prosa-Zeile **zwischen** zwei Bullets steht WHEN `extractDecisionLines` läuft THEN sind alle drei Zeilen enthalten (kein Abbruch an der Prosa-Zeile — Nachweis, dass `extractSection` ohne `bulletsOnly` aufgerufen wird).
- GIVEN eine vorhandene, aber leere `# Entscheidungen`-Section WHEN `extractDecisionLines` läuft THEN liefert sie `[]` (identisch zur fehlenden Section).
- GIVEN `decisionHeadings = ["Entscheidungen","Decisions"]` und eine Besprechung mit beiden Sections WHEN `extractDecisionLines` läuft THEN sind die Zeilen beider Sections in Setting-Reihenfolge in einer flachen Liste enthalten, und `appendDecisionsToFakten` erzeugt daraus genau **ein** Eltern-Bullet.
- GIVEN `decisionHeadings = []` WHEN `extractDecisionLines` läuft THEN liefert sie `[]`, und `appendDecisionsToFakten` mit dieser leeren Liste liefert byte-identischen Content und `insertedLines: 0`.
- GIVEN ein Entscheidungs-Body mit einem eingerückten Unterbullet WHEN `appendDecisionsToFakten` läuft THEN hat das Unterbullet im Ergebnis 8 Leerzeichen (eine Ebene mehr als das Eltern-Bullet-Kind).
- GIVEN ein Vorgang mit `# Fakten und Pointer` und zwei manuellen Bullets, ohne Entscheidungsblock WHEN `appendDecisionsToFakten` läuft THEN steht der Block am Ende der Section, die manuellen Bullets unverändert davor, `# Nächste Schritte` unverändert danach, und `insertedLines` entspricht der Anzahl eingefügter Zeilen.
- GIVEN ein Vorgang mit einem bestehenden Entscheidungsblock einer anderen Besprechung WHEN `appendDecisionsToFakten` läuft THEN steht der neue Block direkt oberhalb des bestehenden.
- GIVEN ein Vorgang, dessen Fakten-Section bereits eine Zeile enthält, die mit `- Entscheidungen ` beginnt und `([[<Besprechung>]])` enthält, WHEN `appendDecisionsToFakten` für dieselbe Besprechung läuft THEN ist der Content byte-identisch und `insertedLines === 0`.
- GIVEN ein Vorgang, dessen Fakten-Section eine manuell geschriebene Zeile enthält, die `[[<Besprechung>]]` verlinkt, aber **nicht** mit `- Entscheidungen ` beginnt (z. B. `- Siehe [[Besprechung]]`), WHEN `appendDecisionsToFakten` für dieselbe Besprechung mit nicht-leeren `decisionLines` läuft THEN wird der neue Block **trotzdem** eingefügt (kein False-Positive-Block).
- GIVEN ein Vorgang ohne `# Fakten und Pointer` WHEN `appendDecisionsToFakten` läuft THEN ist der Content byte-identisch und `insertedLines === 0`.
- GIVEN `decisionLines` ist leer WHEN `appendDecisionsToFakten` läuft THEN ist der Content byte-identisch und `insertedLines === 0`.
- GIVEN `locale = "en"` WHEN `appendDecisionsToFakten` läuft THEN nutzt das Eltern-Bullet das englische Datumsformat, und das Bullet-Label lautet weiterhin `Entscheidungen` (Requirement 14).

## Phase 3 — Verdrahtung in die Ablage-Pfade

`insertBesprechungSummary` und `fileBesprechungIntoVorgang` rufen nach `addVorgangSectionLinked` `appendDecisionsToFakten` auf demselben Content auf und schreiben genau einmal. Im editorbasierten Pfad wird `cursorLineIndex` um `insertedLines` korrigiert. Dokumentation in `CLAUDE.md` und `README.md` nachziehen, inklusive des bekannten Verhaltens: eine Besprechung, die bereits vor Konfiguration von `decisionHeadings` abgelegt wurde, kann ihren Fakten-Block nicht durch erneutes Ablegen nachträglich erhalten, weil der bestehende `alreadyLinked`-Guard den gesamten Vorgangs-Write blockiert (kein Backfill, siehe Out of Scope) — dieser Guard wird nicht speziell behandelt oder umgangen.

Phase complete when: `npm run test` grün (inkl. neuer Acceptance-Tests), `npm run build` grün, Doku aktualisiert.

### Test Scenarios

- GIVEN ein Walk-Stop mit einer Besprechung mit Entscheidungen WHEN der Nutzer einen Vorgang wählt THEN enthält der geschriebene Vorgang-Content sowohl die h5-Sektion mit `**Entscheidungen**` als auch den Fakten-Block, und `vault.modify` wurde für den Vorgang genau einmal aufgerufen.
- GIVEN dieselbe Ablage WHEN sie abgeschlossen ist THEN sind `filed_into`/`filed_at` wie bisher gestempelt und das Pending-Tag entfernt.
- GIVEN eine Besprechung ohne Entscheidungen WHEN sie abgelegt wird THEN ist der Fakten-Abschnitt des Vorgangs unverändert.
- GIVEN dieselbe Besprechung wird ein zweites Mal in denselben Vorgang abgelegt WHEN der bestehende `alreadyLinked`-Guard greift THEN wird der Vorgang nicht geschrieben und kein zweiter Fakten-Block erzeugt.
- GIVEN der Cursor-Einfügepfad in einem Vorgang mit Fakten-Section WHEN eingefügt wird THEN steht der Cursor weiterhin in der neuen h5-Sektion (nicht im Fakten-Block), korrigiert um `insertedLines`.
- GIVEN eine E-Mail-Ablage WHEN sie läuft THEN ist ihr Output unverändert gegenüber den bestehenden Tests.

## Decision Log

- **Eigenes Setting `decisionHeadings` statt Marker-Syntax in `sectionHeadings`** (z. B. `Entscheidungen?→fakten`): Eine Mini-DSL in einem Freitextfeld ist fehleranfällig, schwer zu dokumentieren und schwer zu validieren. Ein zweites Setting kostet eine UI-Zeile und ist selbsterklärend. Ein generisches Routing-Modell (Überschrift → beliebiges Ziel) wurde als YAGNI verworfen: es gibt genau ein Ziel und genau einen Anlass.
- **Hardcoded `"Entscheidungen"` als Matching-Kriterium** verworfen: Granola kann die Überschrift umbenennen, und ein hartcodierter deutscher Name im Engine widerspricht der bestehenden Konfigurierbarkeit von `sectionHeadings`. Das Bullet-**Label** im Output bleibt dennoch fix `Entscheidungen` (Requirement 14) — das ist ein Konzept-Label für den Block, kein Matching-Kriterium und kein Section-Titel.
- **Doppelte Ablage (h5-Sektion **und** Fakten-Log)** statt nur Fakten: Die h5-Sektion bleibt der vollständige Protokollstand des Termins; das Fakten-Log ist der Index zum Nachschlagen. Nutzerentscheidung.
- **Gruppiertes Format (Eltern-Bullet pro Besprechung, Entscheidungen als Unterbullets)** statt flach-datierter Einzelzeilen: kompakter bei mehreren Entscheidungen pro Termin, Besprechungs-Link nur einmal. Nutzerentscheidung; Trade-off (schlechter greppbar) akzeptiert. Gilt auch bei mehreren gematchten `decisionHeadings` — es entsteht immer nur ein Eltern-Bullet pro Filing.
- **Neuer Block oberhalb bestehender Entscheidungsblöcke, aber unterhalb manueller Fakten** statt reines Anhängen oder reines Voranstellen: Voranstellen an den Section-Anfang würde manuell gepflegte Fakten nach unten drücken; reines Anhängen widerspräche der Reverse-Chronologie von `# Inhalt` und den h5-Sektionen. Die gewählte Variante erfüllt beides und ist über das Bullet-Präfix `- Entscheidungen ` deterministisch erkennbar.
- **Idempotenz-Match gebunden an das Präfix `- Entscheidungen `**: eine reine „enthält diesen Wikilink"-Prüfung hätte bei manuell verfassten Fakten-Bullets, die dieselbe Besprechung erwähnen, falsch positiv geblockt. Die Bindung an den deterministischen Block-Präfix (Requirement 7) vermeidet das.
- **Fehlende `# Fakten und Pointer` wird nicht erzeugt**: Struktur anzulegen ist Aufgabe von `vorgang-convert`/`ensureVorgangSkeleton`. Eine Ablage soll keine Notizstruktur erfinden; die Entscheidungen sind über die h5-Sektion ohnehin nicht verloren.
- **Fakten-Log-Routing unabhängig von `sectionHeadings`**: eine Überschrift, die nur in `decisionHeadings` konfiguriert ist, wird trotzdem im Fakten-Log protokolliert, auch wenn sie nicht im h5-Body erscheint. Kein Cross-Check zwischen den beiden Settings — die zwei Settings steuern zwei unabhängige Ziele (h5-Body vs. Fakten-Log) bewusst getrennt.
- **`appendDecisionsToFakten` liefert `{ content, insertedLines }` statt bloßem `string`**: der editorbasierte Pfad braucht die Zeilenanzahl zur Korrektur von `cursorLineIndex`; eine Diff-Berechnung über Zeilenanzahlen vor/nach wäre fragil, sobald die Funktion je unrelated Whitespace normalisiert.
- **`appendDecisionsToFakten` als eigene Funktion statt Wrapper um `mergeH1Section`**: `mergeH1Section` hängt immer am Section-Ende an und legt die Section bei Bedarf an — beides widerspricht Requirements 7 und 8. Der Boundary-Scan wird dennoch von dort übernommen und nicht neu erfunden.
- **`extractDecisionLines` baut auf `extractSection` ohne `bulletsOnly` auf** statt auf einem eigenen Zeilen-Scanner: gleiche Heading-Matching-Semantik wie `formatBesprechungSummary` (nötig, wenn eine Überschrift in beiden Settings steht), und `bulletsOnly = true` würde Requirement 6 unterlaufen.
- **`buildBesprechungFilingPreview` bekommt KEINEN `optionalHeadings`-Parameter** (AMENDMENT, in der Implementierung korrigiert): die Funktion liest `summary.missing` nie — sie gibt ausschließlich `summary.body` oder einen Roh-Auszug zurück. Eine `(missing: …)`-Zeile ist in der Vorschau strukturell unmöglich, der Parameter hätte also keinen Leser (YAGNI / keine spekulativen Parameter). Der Validate-Lauf hatte hier eine missing-Zeile in der Vorschau unterstellt, die es nicht gibt.
- **Cursor-Korrektur setzt die Skelett-Reihenfolge voraus** (AMENDMENT): `cursorLineIndex + insertedLines` stimmt, solange `# Fakten und Pointer` vor den h5-Sektionen steht — was `ensureVorgangSkeleton` immer erzeugt. Stünde eine h5-Sektion physisch oberhalb der Fakten-Section, läge der Cursor um `insertedLines` zu tief. Rein kosmetisch, keine Inhaltskorruption; bewusst nicht abgesichert.
- **E-Mail-Ablage bleibt außen vor**: E-Mails haben keine Entscheidungs-Section; ein Routing dorthin hätte keinen Auslöser. Nutzerentscheidung.
- **Kein Backfill für bereits abgelegte Besprechungen**: der bestehende `alreadyLinked`-Guard auf h5-Ebene blockiert bei erneuter Ablage den gesamten Vorgangs-Write, auch wenn `decisionHeadings` erst danach konfiguriert wurde. Das ist eine bekannte, akzeptierte Konsequenz (konsistent mit „kein Backfill" in Out of Scope) — der Guard wird nicht speziell behandelt.

## Open Decisions

Keine.

## Out of Scope

- Generisches Routing beliebiger Überschriften in beliebige Vorgangs-Sections.
- Entscheidungs-Routing für die E-Mail-Ablage (`email-filing`).
- Nachträgliches Migrieren bereits abgelegter Besprechungen in das Fakten-Log (kein Backfill-Kommando; siehe Decision Log).
- Eine eigene Entscheidungs-Übersicht über alle Vorgänge hinweg (Dataview/Query-Notiz).
- Automatisches Anlegen von `# Fakten und Pointer` in Vorgängen ohne Skelett.
- Änderungen am Vorschlags-Ranking (`besprechung-suggest-engine.ts`) — Entscheidungen sind kein Ranking-Signal.
