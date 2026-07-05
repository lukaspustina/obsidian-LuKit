# SDD: Vorgang-Merge — zwei Vorgänge strukturbewusst zusammenführen

Status: Ready for Implementation
Original: specs/sdd/vorgang-merge.md
Refined: 2026-07-05

## Overview

Zwei Vorgänge, die sich als dasselbe Thema herausstellen, müssen heute von Hand zusammengeführt werden; Obsidians Note Composer hängt nur roh an (doppelte Struktur-Blöcke, unsortierte Sektionen, zerrissenes TOC). Ein neues Kommando „Vorgang: In anderen Vorgang zusammenführen" führt die aktive Notiz (Quelle) strukturbewusst in eine per Picker gewählte Zielnotiz über: Fakten-Bullets angehängt, h5-Sektionen samt TOC-Einträgen datumssortiert eingefügt, Duplikate übersprungen. Die Quelle wird zum Stub mit Verweis und gilt als abgeschlossen.

## Context & Constraints

- TypeScript strict, pure Engine (`vorgang-engine.ts`, keine Obsidian-Imports) + impure Feature (`vorgang-feature.ts`); Vitest (`tests/sdd_vorgang-merge/`, eine Datei pro Kriterium); UI deutsch; kein PII in Fixtures.
- Vorgang-Struktur: Frontmatter, `# Fakten und Pointer` (Bullets), optional `# Nächste Schritte` (Bullets, laut Vault-Template vorhanden), `# Inhalt` (TOC-Wikilink-Bullets), darunter h5-Sektionen (`##### Name, DD.MM.YYYY` oder `##### [[Link]], DD.MM.YYYY`), neueste zuerst.
- Vorhandene Bausteine: `insertVorgangContent` (vorgang-engine, datumssortierte Einzel-Einfügung mit den getesteten Sortier-/Abstands-Invarianten — derzeit **nicht exportiert**, wird exportiert), `extractSection` (besprechung-engine, **nur lesend genutzt** — liefert Text, keine Einfüge-Indizes, daher für den Merge selbst nicht ausreichend), `findInhaltSectionIndex`/`findInhaltBulletRange`/`extractWikilinkTarget`/`formatLinkedBullet` (shared/note-structure), Dedup-Logik aus `vorgangAlreadyLinks` (besprechung-feature, wird extrahiert), `SECTION_NOTE_TAGS`/`addTagToFrontmatter` (shared/frontmatter), Abschließen-Muster aus `vorgang-close`.
- `newestH5Sections` (task-triage-engine.ts, privat) wird bewusst **nicht** wiederverwendet: sie liefert fertigen Preview-Text für die Anzeige, keine strukturierten Sektionsobjekte mit Header/Datum/Link/Body, wie sie der Merge zum Neuaufbau von Header + TOC-Eintrag benötigt.
- Picker: `SectionNoteSuggestModal` mit `excludeTag` (doneTag) und `excludePath` (Quelle selbst).
- Es existiert kein Shared-Helfer „Frontmatter-Ende im Rohtext" — die Engine bekommt einen privaten Parser dafür (Zeile 0 `---` → nächstes `---`); dieser Parser wird sowohl von `mergeVorgangContent` als auch von `buildStubContent` genutzt.
- `<Quelle>` und `<Ziel>` sind in allen user-sichtbaren Strings (Notice, Tagebuchzeile, Stub-Satz) **Basenames** (ohne Pfad, ohne `.md`), konsistent mit der bestehenden `[[…]]`-Konvention im Vault.

## Architecture

- **Sektions-Enumeration** der Quelle: Scan über rohe `##### `-Header (Header + Body bis zur nächsten h5/h1) — das Quell-TOC ist irrelevant, TOC-Einträge im Ziel werden neu synthetisiert. Quell-Inhalt außerhalb der erkannten Sektionen (`# Fakten und Pointer`, `# Nächste Schritte`, `# Inhalt`, h5-Sektionen) — z. B. eigene h1-Überschriften oder Freitext vor der ersten Überschrift — wird nicht erkannt und beim Merge nicht übernommen (siehe Out of Scope).
- **Einfügung** pro Quell-Sektion über das bestehende `insertVorgangContent` (kein Full-Rebuild — die Sortier-/Abstands-Regeln bleiben an einer Stelle). Da dessen Tie-Break Einfügungen bei Datums-Gleichstand voranstellt, werden die Quell-Sektionen in **umgekehrter Quell-Reihenfolge** eingefügt, sodass die ursprüngliche Reihenfolge bei gleichem Datum erhalten bleibt (R6a).
- `mergeVorgangContent` ist die einzige öffentliche Merge-Funktion, intern zerlegt in private Helfer: h5-Sektions-Parser (Quelle), Frontmatter-Ende-Parser, Sektions-Body-Extraktion, Fakten-/Nächste-Schritte-Append-Helfer. Diese Zerlegung ist verbindlich — keine einzelne monolithische Implementierung.
- **Merge-Ablauf im Feature**: Quelle einmal lesen (`vault.read`) → ein einziger `vault.process(ziel, (targetContent) => { ... })`-Call, dessen Callback `mergeVorgangContent(sourceContent, targetContent, locale, mergeDate)` aufruft, das volle Ergebnis in einer äußeren Variable (`mergeResult`) festhält und `newTargetContent` zurückgibt. Die Notice-Zählwerte (`mergedSections`, `skippedDuplicates`) stammen danach aus `mergeResult` — derselben Berechnung, die auch geschrieben wurde, keine separate Vorberechnung auf einem möglicherweise veralteten Ziel-Stand.
- **Stub-Schreibvorgang** (nach erfolgreichem Ziel-Schreiben): ein `vault.process(quelle, (liveContent) => buildStubContent(liveContent, zielBasename))`-Call baut den neuen Body aus dem *Live*-Inhalt der Quelle (Frontmatter-Block byte-identisch übernommen + Leerzeile + `Zusammengeführt in [[<Ziel>]].` + Zeilenumbruch), **gefolgt von** einem `processFrontMatter`-Call, der das doneTag hinzufügt und `note_type` entfernt. Kein `vault.modify` für den Stub. Kein `fileManager.renameFile`-Aufruf (siehe R8).

## Requirements

1. Neues Kommando `vorgang-merge` („Vorgang: In anderen Vorgang zusammenführen") shall auf der aktiven Notiz arbeiten (Quelle); Guards in dieser Reihenfolge: keine aktive Notiz / Quelle ist keine Zielnotiz (SECTION_NOTE_TAGS) / Quelle bereits abgeschlossen (doneTag) → jeweils deutsche Notice, Abbruch **vor** dem Picker.
2. Das Ziel shall per `SectionNoteSuggestModal` gewählt werden (excludeTag = doneTag, excludePath = Quelle).
3. Die Engine shall eine pure Funktion bereitstellen: `mergeVorgangContent(sourceContent: string, targetContent: string, locale: DateLocale, mergeDate: Date): { newTargetContent: string; mergedSections: number; skippedDuplicates: number }` — `mergeDate` ist Parameter (deterministisch testbar), das Feature übergibt `new Date()`.
4. Fakten-Merge: **Alle nicht-leeren Zeilen** der Quell-Sektion `# Fakten und Pointer` (verbatim, inklusive verschachtelter Bullets und Freitext — kein Datenverlust) shall ans Ende der Ziel-Fakten-Sektion angehängt werden, **ohne** eine Leerzeile zwischen letzter Alt- und erster Neu-Zeile einzufügen. Fehlt die Ziel-Sektion, wird sie **direkt nach dem Frontmatter** (bzw. am Notiz-Anfang) angelegt; leere/fehlende Quell-Fakten ändern nichts.
5. Nächste-Schritte-Merge: Analog R4 für `# Nächste Schritte`. Fehlen im Ziel beide Sektionen, gilt die Reihenfolge Fakten → Nächste Schritte, beide vor `# Inhalt`. Existiert `# Fakten und Pointer` im Ziel bereits (und fehlt nur `# Nächste Schritte`), wird `# Nächste Schritte` direkt danach (und weiterhin vor `# Inhalt`) neu angelegt.
6. Sektions-Merge: Jede h5-Sektion der Quelle shall mitsamt neu synthetisiertem TOC-Eintrag datumssortiert ins Ziel eingefügt werden (Datum aus dem Header via `extractDateFromTitle`; **datumslose Sektionen erhalten das `mergeDate`** — einsortiert wie datiert, der neue TOC-Eintrag trägt das `mergeDate`, der eingefügte Header bleibt textlich unverändert).
   6a. Bei Datums-Gleichstand bleibt die Quell-Reihenfolge erhalten (Einfügung in umgekehrter Quell-Reihenfolge, siehe Architecture).
7. Dedup: Eine Quell-Sektion shall übersprungen und in `skippedDuplicates` gezählt werden, wenn ihr Header einen `[[…]]`-Link enthält, dessen Basename im Ziel-TOC bereits verlinkt ist (`tocAlreadyLinks`, inklusive Datums-Suffix-Variante). **Header ohne Wikilink dedupen nie** (kein Vergleichsziel — nur verlinkte Sektionen können per Definition Duplikate sein).
8. Nach erfolgreichem Merge shall die Quelle zum Stub werden: ein `vault.process`-Call baut aus dem Live-Inhalt der Quelle den neuen Body — Frontmatter-Block byte-identisch übernommen, danach eine Leerzeile, dann `Zusammengeführt in [[<Ziel>]].`, abschließender Zeilenumbruch (Notizen ohne Frontmatter: nur Satz + Zeilenumbruch) —, **gefolgt von** einem separaten `processFrontMatter`-Call, der das doneTag hinzufügt und `note_type` entfernt. Alle anderen Frontmatter-Felder bleiben unverändert. **Die Quelle wird NICHT umbenannt** (kein `fileManager.renameFile`-Aufruf; bewusste Abweichung vom vorgang-close-Muster: der stabile Pfad hält eingehende Wikilinks und `filed_into`-Stempel wörtlich gültig).
9. Ein Tagebucheintrag `- [[<Quelle>]] → in [[<Ziel>]] zusammengeführt` shall unter dem heutigen Datum entstehen (fehlender Tagebuch-Pfad/fehlende Notiz → still übersprungen, wie beim Abschließen; gleiches Einfüge-Muster wie `addDiaryEntryForClose`); `<Quelle>`/`<Ziel>` sind Basenames.
10. Abschluss-Notice mit deutscher Pluralisierung: `„<Quelle>" → „<Ziel>": <N> <Sektion|Sektionen> übernommen, <M> <Duplikat|Duplikate> übersprungen.` (`<Quelle>`/`<Ziel>` sind Basenames, konsistent mit R9).
11. Schreib-Reihenfolge shall ausfallsicher sein: erst das Ziel (`vault.process`), erst danach die Quelle stubben (Body-`vault.process` + `processFrontMatter`); scheitert der Ziel-Schreibvorgang, bleibt die Quelle byte-identisch unangetastet und es erscheint `Merge fehlgeschlagen: <e.message>`; scheitert einer der beiden Stub-Schreibschritte nach erfolgreichem Ziel-Schreiben, erscheint `Ziel aktualisiert, aber Quelle konnte nicht gestubbt werden: <e.message>` (kein Tagebucheintrag in beiden Fehlerfällen des jeweils gescheiterten Schritts — Tagebuch nur nach vollständigem Erfolg).
12. Die Dedup-Prüfung shall als pure Funktion `tocAlreadyLinks(lines: string[], target: string): boolean` nach `src/shared/note-structure.ts` extrahiert werden (identische Semantik wie `vorgangAlreadyLinks` inkl. Datums-Suffix-Zweig, entgegennimmt bereits gesplittete Zeilen); `besprechung-feature.vorgangAlreadyLinks` delegiert (keine Kopie) — der `content.split("\n")` des heutigen `vorgangAlreadyLinks` wandert zum Aufrufer, der Delegator splittet vor dem Aufruf. Alle neuen Parsing-/Merge-Funktionen sind pure und leben in `vorgang-engine.ts`.

## File & Module Structure

- `src/features/vorgang/vorgang-engine.ts` — neu: `mergeVorgangContent`, `buildStubContent(liveContent: string, targetBasename: string): string`, plus private Helfer (h5-Sektions-Parser, Frontmatter-Ende-Parser — gemeinsam genutzt von `mergeVorgangContent` und `buildStubContent`, Sektions-Body-Extraktion, Fakten-/Nächste-Schritte-Append-Helfer); `insertVorgangContent` wird **exportiert**.
- `src/shared/note-structure.ts` — neu: `tocAlreadyLinks(lines: string[], target: string): boolean` (extrahiert aus besprechung-feature).
- `src/features/besprechung/besprechung-feature.ts` — `vorgangAlreadyLinks` delegiert an `tocAlreadyLinks`; splittet `content.split("\n")` selbst vor dem Aufruf.
- `src/features/vorgang/vorgang-feature.ts` — Kommando `vorgang-merge`, Guards, Merge-Ablauf, Stub, Tagebucheintrag, helpEntry.
- `tests/sdd_vorgang-merge/` — Kriterien-Tests (`sdd_vorgang-merge_p<N>_c<M>_<slug>.test.ts`).
- README.md + CLAUDE.md — Kommando dokumentieren.

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---|---|---|---|
| Keine aktive Notiz | kein Active File | Abbruch vor Picker | Notice, Picker wird nie konstruiert |
| Quelle keine Zielnotiz | Tag fehlt | Abbruch vor Picker | `„X" ist keine Zielnotiz (Tag Vorgang/Person/Bestellung/Bewerbung fehlt).` |
| Quelle bereits abgeschlossen | doneTag vorhanden | Abbruch vor Picker | `„X" ist bereits abgeschlossen.` |
| Ziel-Schreiben scheitert | `vault.process` (Ziel) wirft | Quelle byte-identisch unangetastet, kein Tagebucheintrag | `Merge fehlgeschlagen: <e.message>` |
| Stub-Schreiben scheitert | `vault.process` (Body) oder `processFrontMatter` (Frontmatter) der Quelle wirft, nach erfolgreichem Ziel-Schreiben | Ziel behält Merge, kein Tagebucheintrag | `Ziel aktualisiert, aber Quelle konnte nicht gestubbt werden: <e.message>` |
| Tagebuch fehlt | kein Pfad / Notiz fehlt | still übersprungen, Merge-Notice erscheint trotzdem | — |

## Phase 1 — Engine: mergeVorgangContent

Pure Merge-Funktion (Signatur R3) inkl. Sektions-Parser, Frontmatter-Ende-Parser, `buildStubContent`, `insertVorgangContent`-Export und `tocAlreadyLinks`-Extraktion mit Delegation.

Phase complete when: Engine-Funktionen implementiert und unit-getestet (alle Szenarien unten); `npm run test` und `npm run build` grün.

### Test Scenarios

- GIVEN Quelle mit Fakten-Bullets `["A", "B"]` und Ziel mit `["X"]` WHEN `mergeVorgangContent` läuft THEN enthält die Ziel-Fakten-Sektion `["X", "A", "B"]` in dieser Reihenfolge, ohne eingefügte Leerzeile zwischen `"X"` und `"A"`.
- GIVEN Ziel ohne `# Fakten und Pointer` und Quelle mit einem Bullet WHEN gemerged wird THEN legt das Ziel die Sektion direkt nach dem Frontmatter an (vor `# Inhalt`) und übernimmt den Bullet.
- GIVEN Quell-Fakten mit verschachteltem Bullet und einer Freitext-Zeile WHEN gemerged wird THEN werden alle nicht-leeren Zeilen verbatim übernommen (kein Datenverlust).
- GIVEN leere/fehlende Quell-Fakten WHEN gemerged wird THEN ist die Ziel-Fakten-Sektion textlich unverändert.
- GIVEN Ziel mit h5-Sektion (30.06.2026) und Quelle mit zwei Sektionen (01.07.2026, 15.06.2026, keine Duplikate) WHEN gemerged wird THEN stehen die Header im Ziel in der Reihenfolge 01.07. → 30.06. → 15.06., das TOC in derselben Reihenfolge, und `mergedSections === 2`.
- GIVEN Quell-Sektion `##### [[Besprechung - Acme]], 01.07.2026`, deren Link-Basename im Ziel-TOC bereits verlinkt ist WHEN gemerged wird THEN wird sie nicht eingefügt, nicht gezählt (`mergedSections`), und `skippedDuplicates === 1`.
- GIVEN die Datums-Suffix-Variante (Ziel-TOC `[[#Besprechung - Acme, 30.06.2026]]`, Quell-Header-Link `[[Besprechung - Acme]]`) WHEN gemerged wird THEN greift der Dedup ebenfalls (Parität mit `vorgangAlreadyLinks`).
- GIVEN eine Quell-Sektion mit Wikilink-freiem Header (`##### Telefonat, 01.07.2026`) und ein Ziel mit gleichnamigem TOC-Eintrag WHEN gemerged wird THEN wird sie NICHT dedupliziert, sondern eingefügt (nur verlinkte Header dedupen).
- GIVEN eine datumslose Quell-Sektion und `mergeDate` 05.07.2026 WHEN gemerged wird THEN ist sie wie am 05.07.2026 datiert einsortiert, ihr TOC-Eintrag trägt `05.07.2026`, ihr Header bleibt textlich unverändert.
- GIVEN zwei Quell-Sektionen mit identischem Datum WHEN gemerged wird THEN bleibt ihre Quell-Reihenfolge im Ziel erhalten (R6a).
- GIVEN Quelle mit `# Nächste Schritte`-Bullets und Ziel ohne die Sektion WHEN gemerged wird THEN erhält das Ziel die Sektion mit exakt den Quell-Bullets, ohne Vermischung mit den Fakten.
- GIVEN Ziel ohne `# Fakten und Pointer` UND ohne `# Nächste Schritte`, Quelle mit Bullets für beide WHEN gemerged wird THEN werden beide Sektionen in der Reihenfolge Fakten → Nächste Schritte angelegt, beide vor `# Inhalt`.
- GIVEN Quelle ohne Fakten, Nächste Schritte und h5-Sektionen WHEN gemerged wird THEN gilt `newTargetContent === targetContent` (string-gleich) und `mergedSections === 0`, `skippedDuplicates === 0`.
- GIVEN ein einzelner `mergeVorgangContent`-Aufruf mit 2 nicht-duplizierten und 1 duplizierter Sektion zusammen WHEN gemerged wird THEN gilt gleichzeitig `mergedSections === 2` und `skippedDuplicates === 1` (kombinierter Fall, nicht nur isoliert getestet).
- GIVEN die aus besprechung-feature extrahierte `tocAlreadyLinks` WHEN sie mit den bisherigen `vorgangAlreadyLinks`-Fixtures läuft THEN liefert sie identische Ergebnisse (Regressions-Pin der Extraktion).

## Phase 2 — Kommando, Stub und Tagebuch

Kommando + Guards + Picker, Merge-Ablauf (Quelle lesen → Ziel via `vault.process` → Stub via `vault.process` + `processFrontMatter` → Tagebuch → Notice), Doku (README + CLAUDE.md).

Phase complete when: alle Szenarien unten grün; README/CLAUDE.md aktualisiert; `npm run test` und `npm run build` grün.

### Test Scenarios

- GIVEN aktive Quelle (Tag Vorgang) und gewähltes Ziel WHEN der Merge läuft THEN enthält das Ziel die Quell-Sektionen; die Quelle besteht byte-exakt aus Frontmatter + Leerzeile + `Zusammengeführt in [[<Ziel>]].` + Zeilenumbruch, trägt das doneTag, kein `note_type`, und **ihr Pfad/Basename ist unverändert** (kein Rename).
- GIVEN derselbe erfolgreiche Merge WHEN auf dem Mock der Quelle geprüft wird THEN wurde `fileManager.renameFile` nie aufgerufen (Mock: `renamedTo` bleibt leer) — Regression-Guard gegen das vorgang-close-Muster.
- GIVEN kein aktives File WHEN das Kommando läuft THEN erscheint eine Notice und der Picker wird nie konstruiert.
- GIVEN konfiguriertes Tagebuch WHEN der Merge erfolgreich ist THEN steht `- [[Quelle]] → in [[Ziel]] zusammengeführt` unter dem heutigen Datum.
- GIVEN kein Tagebuch-Pfad (oder Notiz fehlt) WHEN der Merge erfolgreich ist THEN wirft nichts und die Merge-Notice erscheint trotzdem.
- GIVEN das Ziel-Schreiben wirft WHEN der Merge läuft THEN ist die Quelle byte-identisch unverändert, es erscheint `Merge fehlgeschlagen: …`, und es entsteht kein Tagebucheintrag.
- GIVEN das Stub-Schreiben wirft (Ziel-Schreiben erfolgreich) WHEN der Merge läuft THEN behält das Ziel den Merge und es erscheint `Ziel aktualisiert, aber Quelle konnte nicht gestubbt werden: …`.
- GIVEN Quelle ohne Zielnotiz-Tag WHEN das Kommando läuft THEN erscheint die Guard-Notice und der Picker wird nie konstruiert.
- GIVEN bereits abgeschlossene Quelle WHEN das Kommando läuft THEN erscheint `bereits abgeschlossen` und der Picker öffnet sich nicht.
- GIVEN erfolgreicher Merge mit `mergedSections = 2, skippedDuplicates = 1` WHEN die Notice erscheint THEN lautet sie exakt `„<Quelle>" → „<Ziel>": 2 Sektionen übernommen, 1 Duplikat übersprungen.` (Singular/Plural korrekt, `<Quelle>`/`<Ziel>` sind Basenames wie im Tagebucheintrag).

## Decision Log

- **Aktive Notiz = Quelle, Picker = Ziel**: natürlicher Fluss; umgekehrt bräuchte es zwei Picker. *(Vom Nutzer bestätigt.)*
- **Quelle wird Stub + Done** (statt löschen oder unangetastet): eingehende Wikilinks bleiben funktional; Done-Tag + `note_type`-Entfernung nutzen die Abschließen-Semantik. *(Vom Nutzer bestätigt.)*
- **Kein Rename der Quelle** (bewusste Abweichung von vorgang-close): der stabile Pfad hält `filed_into`-Stempel und eingehende Links wörtlich gültig, ohne auf Obsidians Link-Rewriting angewiesen zu sein.
- **Struktur-Merge statt Note Composer**: Composer hängt roh an — für die Vorgang-Struktur unbrauchbar. *(Vom Nutzer bestätigt.)*
- **Kein Frontmatter-Merge**: Quell-Felder (contexts, scheduled, …) wandern NICHT ins Ziel — reiner Body-Merge. *(Vom Nutzer bestätigt.)*
- **SDD-Pipeline statt Direktimplementierung**: größtes Stück der Serie. *(Vom Nutzer bestätigt.)*
- **Wiederholte `insertVorgangContent`-Aufrufe statt Full-Rebuild**: die fummeligen Sortier-/Abstands-Invarianten bleiben an einer getesteten Stelle; O(Sektionen × Zeilen) ist auf Notiz-Skala irrelevant. Tie-Break-Umkehrung wird durch umgekehrte Einfüge-Reihenfolge kompensiert (R6a).
- **`mergeDate` als Parameter**: pure Funktion, deterministisch testbar — kein implizites `new Date()` in der Engine.
- **Dedup nur für verlinkte Header**: Header ohne Wikilink haben kein Vergleichsziel; Name-basierte Text-Vergleiche wären fragil (legitime gleichnamige Sektionen).
- **Ziel zuerst schreiben, dann Quelle stubben**: schlimmster Abbruchfall ist sichtbarer Doppel-Inhalt statt Datenverlust.
- **Zählwerte aus der `vault.process`-Closure statt Vorberechnung**: `mergedSections`/`skippedDuplicates` werden aus demselben `mergeVorgangContent`-Aufruf übernommen, der auch schreibt — keine zweite, potenziell veraltete Vorberechnung auf dem gelesenen Ziel-Stand.
- **`newestH5Sections` (task-triage-engine.ts) nicht wiederverwendet**: liefert fertigen Preview-Text statt strukturierter Sektionsobjekte (Header/Datum/Link/Body), die der Merge zum Neuaufbau von Header + TOC-Eintrag benötigt; `extractSection` (besprechung-engine) wird nur lesend genutzt, da sie Text statt Einfüge-Indizes liefert.
- **Terminologie „zusammenführen"**: Kommandoname, Stub-Satz und Tagebuchzeile verwenden einheitlich „zusammenführen" (statt „mergen") — die Command-ID bleibt stabil `vorgang-merge` (IDs ändern sich laut Konvention nie, nur `name`/`displayName`).

## Open Decisions

Keine.

## Out of Scope

- Merge von mehr als zwei Vorgängen in einem Schritt.
- Umbiegen der `filed_into`-Stempel alter Besprechungen von Quelle auf Ziel (der Stub-Verweis genügt lesend).
- Undo/Rückgängig über den Stub hinaus.
- Zusammenführen von Nicht-Vorgang-Notizen ohne Zielnotiz-Tag.
- Frontmatter-Merge (Quell-Felder ins Ziel).
- Quell-Inhalt außerhalb der erkannten Sektionen (eigene h1-Überschriften, Freitext vor der ersten Überschrift, Inhalt nach der letzten h5-Sektion, das keine neue Überschrift ist) — wird beim Merge stillschweigend verworfen; Nutzer prüft die Quelle vor dem Merge.
