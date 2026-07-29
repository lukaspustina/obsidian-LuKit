# SDD Implementation Report: besprechung-entscheidungen.md

**Date**: 2026-07-29
**Phases run**: 1, 2, 3
**Overall status**: all-shipped
**SDD amendments suggested**: 2 (beide bereits in die SDD eingearbeitet)

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Optionale Überschriften + Setting | shipped | db2666b (Tests: c047268) |
| 2 | Engine: Entscheidungs-Extraktion und Fakten-Append | shipped | 8c78417 (Tests: 446c16a) |
| 3 | Verdrahtung in die Ablage-Pfade | shipped | c56047e (Tests: c79b920) |

Tests: 755 grün (162 Dateien), `npm run build` grün. Ausgangsbasis waren 729 Tests — 26 neue.

## Abweichung von der Skill-Mechanik

Statt ~26 paralleler Test-Writer-Agents (einer pro Kriterium, je eigene Datei unter
`tests/sdd_besprechung-entscheidungen/`) wurden die Tests direkt in die von der SDD
benannten Dateien geschrieben: `tests/unit/besprechung-engine.test.ts`,
`tests/unit/vorgang-engine.test.ts`, `tests/unit/types.test.ts`,
`tests/acceptance/besprechung-vault.test.ts`, `tests/acceptance/besprechung-feature.test.ts`.
Grund: die SDD legt diese Dateien in der File-&-Module-Structure-Tabelle explizit fest,
und 26 Einzeldateien für zwei Engine-Funktionen widersprechen der Projektkonvention.
Der TDD-Ablauf (RED bestätigt → Test-Commit → Implementierung → Review → Phasen-Commit)
wurde je Phase eingehalten.

## Phase 1: Optionale Überschriften + Setting

**Status**: shipped · **Commit**: db2666b

| # | Kriterium | Tests | Status |
|---|-----------|-------|--------|
| 1 | Optionale Überschrift nicht in `missing` | besprechung-engine.test.ts | passing |
| 2 | Nicht-optionale weiter in `missing` | besprechung-engine.test.ts | passing |
| 3 | See-full-notes-Zeile nennt nur die nicht-optionale | besprechung-engine.test.ts | passing |
| 4 | Vorhandene optionale Überschrift normal extrahiert | besprechung-engine.test.ts | passing |
| 5 | Nur in `decisionHeadings` → nicht im h5-Body | besprechung-engine.test.ts | passing |
| 6 | Leere `optionalHeadings`-Liste | besprechung-engine.test.ts | passing |
| 7 | Default `["Entscheidungen"]` + `mergeSettings`-Fallback | types.test.ts | passing |
| 8 | Vorschau ohne missing-Zeile | besprechung-engine.test.ts | passing |

### Reviewer-Findings
**Blockers**: keine

## Phase 2: Engine: Entscheidungs-Extraktion und Fakten-Append

**Status**: shipped · **Commit**: 8c78417

| # | Kriterium | Tests | Status |
|---|-----------|-------|--------|
| 1 | Bullets extrahiert, Leerzeilen verworfen | besprechung-engine.test.ts | passing |
| 2 | Nicht-Bullet-Zeile normalisiert | besprechung-engine.test.ts | passing |
| 3 | Prosa zwischen Bullets nicht abgeschnitten (`bulletsOnly = false`) | besprechung-engine.test.ts | passing |
| 4 | `*`-Marker erhalten | besprechung-engine.test.ts | passing |
| 5 | Relative Einrückung erhalten | besprechung-engine.test.ts | passing |
| 6 | Mehrere Überschriften in Setting-Reihenfolge, ein Eltern-Bullet | besprechung-engine.test.ts | passing |
| 7 | `decisionHeadings = []` → `[]` | besprechung-engine.test.ts | passing |
| 8 | Fehlende / leere Section → `[]` | besprechung-engine.test.ts | passing |
| 9 | Block am Section-Ende, `insertedLines` korrekt | vorgang-engine.test.ts | passing |
| 10 | Manuelle Fakten und Folge-Section unberührt | vorgang-engine.test.ts | passing |
| 11 | Neuer Block oberhalb bestehendem | vorgang-engine.test.ts | passing |
| 12 | Sub-Bullets +1 Ebene (8 Leerzeichen) | vorgang-engine.test.ts | passing |
| 13 | Idempotenz via Präfix + Link | vorgang-engine.test.ts | passing |
| 14 | Manueller Link ohne Präfix blockiert nicht | vorgang-engine.test.ts | passing |
| 15 | No-Op ohne Fakten-Section / bei leerer Liste | vorgang-engine.test.ts | passing |
| 16 | Locale-Datum, fixes Label | vorgang-engine.test.ts | passing |
| 17 | Leere Fakten-Section | vorgang-engine.test.ts | passing |

### Reviewer-Findings
**Blockers**: keine

## Phase 3: Verdrahtung in die Ablage-Pfade

**Status**: shipped · **Commit**: c56047e

| # | Kriterium | Tests | Status |
|---|-----------|-------|--------|
| 1 | h5-Sektion + Fakten-Block in einem `vault.modify` | besprechung-vault.test.ts | passing |
| 2 | Manueller Fakt bleibt oberhalb | besprechung-vault.test.ts | passing |
| 3 | Ohne Entscheidungen → Fakten unberührt | besprechung-vault.test.ts | passing |
| 4 | Ohne Fakten-Section → kein Log | besprechung-vault.test.ts | passing |
| 5 | Default-Konfiguration: Log ja, h5-Body nein (R13) | besprechung-vault.test.ts | passing |
| 6 | `decisionHeadings = []` → kein Log | besprechung-vault.test.ts | passing |
| 7 | Editor-Pfad: Log + korrigierte Cursorposition | besprechung-feature.test.ts | passing |

### Reviewer-Findings
**Blockers**: keine
**SDD Amendments**: 2 (siehe unten) — advisory, haben den Commit nicht blockiert
**Nits**: 5, davon 3 behoben (nicht-diskriminierende Cursor-Assertion → exakte Zeile gepinnt und per
Mutationsprobe verifiziert; vakuöser Vorschau-Test → auf exakten Output verschärft; fehlender
Default-Konfigurations-Test → ergänzt). 2 nicht behoben: `/^#{1,5} /` terminiert nicht an h6
(unverändert von `sliceSectionBody` übernommen, wie die SDD als Prior Art vorgibt) und `cli.js`
(getracktes Build-Artefakt, das gleichzeitig in `.gitignore` steht — bestehende Repo-Inkonsistenz,
enthält nur den Versions-String der v1.21.0; nicht angefasst).

### Behavioral Verification

Kein UI-Entry-Point ohne Obsidian-Runtime aufrufbar, daher die Engines end-to-end mit einer
Granola-artigen Notiz gefahren (`npx tsx`, Skript im Scratchpad):

`extractDecisionLines + addVorgangSectionLinked + appendDecisionsToFakten` auf eine Notiz mit
`# Entscheidungen` (inkl. verschachteltem Sub-Bullet) und einen Vorgang mit einem manuellen Fakt →

```markdown
# Fakten und Pointer
- Ansprechpartnerin: Erika Beispiel
- Entscheidungen 29.07.2026 ([[Acme Kickoff]])
    - Migration auf Variante B
    - Budget bleibt bei Q3
        - Nachtrag erst 2027

# Inhalt
- [[#Acme Kickoff, 29.07.2026]]

##### [[Acme Kickoff]], 29.07.2026
**Entscheidungen**
- Migration auf Variante B
…
```

- `insertedLines: 4` — passt zur Blockgröße.
- Zweite Ablage derselben Besprechung: Content byte-identisch, `insertedLines: 0`.
- Zweite Besprechung (05.08.2026): landet oberhalb des 29.07.-Blocks, manueller Fakt bleibt oben.

Der Obsidian-Runtime-Pfad (Settings-UI, Picker) ist damit **nicht** verifiziert — siehe Manual Test Plan.

## SDD Amendments Needed

Beide wurden bereits in `specs/sdd/besprechung-entscheidungen.md` eingearbeitet (Decision Log,
Architecture, Data Models, File-Tabelle, Phase-1-Szenario):

1. **`buildBesprechungFilingPreview` bekommt keinen `optionalHeadings`-Parameter.** Die Funktion
   liest `summary.missing` nie — sie gibt nur `summary.body` oder einen Roh-Auszug zurück. Eine
   `(missing: …)`-Zeile ist in der Vorschau strukturell unmöglich; der Parameter hätte keinen Leser.
   Der `/sdd-validate`-Lauf hatte eine missing-Zeile in der Vorschau unterstellt, die es nicht gibt.
2. **Die Cursor-Korrektur setzt die Skelett-Reihenfolge voraus.** `cursorLineIndex + insertedLines`
   stimmt, solange `# Fakten und Pointer` vor den h5-Sektionen steht (was `ensureVorgangSkeleton`
   immer erzeugt). Bei invertierter Reihenfolge läge der Cursor um `insertedLines` zu tief — rein
   kosmetisch, bewusst nicht abgesichert.

## Manual Test Plan

Das Plugin im echten Vault testen (`npm run build`, Obsidian neu laden):

1. **Einstellungen → LuKit → Besprechung**: Feld „Entscheidungs-Überschriften" ist vorhanden und
   zeigt `Entscheidungen` — erwartet: Default greift auch bei bestehender Konfiguration.
2. `Entscheidungen` zusätzlich vorne in „Abschnitts-Überschriften" eintragen — erwartet: Entscheidungen
   erscheinen künftig auch im h5-Body der Ablage.
3. **Besprechungen: Alle offenen ablegen** mit einer Granola-Notiz, die `# Entscheidungen` enthält, in
   einen Vorgang mit `# Fakten und Pointer` ablegen — erwartet: unter Fakten und Pointer ein Bullet
   `- Entscheidungen <heute> ([[<Besprechung>]])` mit den Entscheidungen als eingerückte Unterbullets,
   unterhalb der bestehenden Fakten; die h5-Sektion enthält die volle Zusammenfassung.
4. Eine Granola-Notiz **ohne** `# Entscheidungen` ablegen — erwartet: keine
   `(missing: Entscheidungen)`-Zeile in der Einfügung, Fakten-Abschnitt unverändert.
5. Eine zweite Besprechung mit Entscheidungen in denselben Vorgang ablegen — erwartet: der neue Block
   steht **oberhalb** des ersten, die manuellen Fakten bleiben ganz oben.
6. **Besprechung: Zusammenfassung einfügen** in einem geöffneten Vorgang — erwartet: Fakten-Block wird
   ergänzt und der Cursor landet in der neuen h5-Sektion (nicht im Fakten-Block).
7. In einen Vorgang **ohne** `# Fakten und Pointer` ablegen — erwartet: nur h5-Sektion, kein Log, keine
   Fehlermeldung.
