# SDD: E-Mail-Anhänge per Checkbox auswählen (Delta zu email-attachments)

Status: Done
Finished: 2026-07-09

Original: specs/sdd/email-attachment-selection.md
Refined: 2026-07-09
Base: specs/done/sdd/email-attachments-2026-07-05.md

## Overview

Die Anhang-Ablage (Base-SDD) speichert Footer-Grafiken mit „echten" Namen (`logo.png`, `linkedin.jpg`) mit, weil `filterAttachments` nur Auto-Namen-Inline-Bilder (`image001.png`) erkennt. Künftig bekommt jeder Anhang im `EmailPreviewModal` eine eigene Checkbox mit schlauer Vorbelegung: Dokumente angehakt, Bilder abgehakt außer sie sind groß genug für ein echtes Foto (≥ 500 KB). Abgewählte Anhänge werden weder gespeichert noch in der `Anhänge:`-Zeile gelistet.

## Context & Constraints

- Basis-Feature vollständig shipped (Base-SDD): `saveAttachments`-Bridge, `resolveAttachmentFileNames`, `savedNames`-Rendering, Save-Schritt (`saveThreadAttachments`) in `commitThread`/`commitSelectedThread`.
- `EmailPreviewModal` (`src/features/email-filing/email-preview-modal.ts`): eine Zeile pro Nachricht — Include-Checkbox (`<label class="lukit-email-preview-header">` wrapt `<input type=checkbox>` + `<span>`) + editierbares Body-Textarea (`<textarea class="lukit-email-preview">`) + bisher read-only `attachmentsLine: string | null`, gerendert als `row.createEl("p", { cls: "lukit-email-preview-atts", text: msg.attachmentsLine })` nur wenn nicht `null`. `PreviewMessageResult { included, body }` positional zum Input (`this.messages.map((_, i) => ({ included: checkboxes[i].checked, body: textareas[i].value }))`).
- `MailAttachment { name, mimeType, size }` — `size` kann `-1` sein (nicht lesbar); `mimeType` kann leer sein (wirft in manchen Mail-Versionen).
- `filterAttachments` (Inline-Bild-Filter, Regex `INLINE_IMAGE_NAME = /^image\d+\.(png|jpe?g|gif|bmp|tiff?)$/i`, email-format-engine.ts:28) bleibt unverändert die Vorstufe — Inline-Bilder erscheinen gar nicht erst als Checkbox.
- Der nicht-interaktive Testpfad `fileEmailIntoVorgang` (assemble → commit ohne Preview) bleibt unverändert: ohne UI keine Vorbelegung, alle (post-`filterAttachments`) Anhänge werden übernommen.
- Deutsch-UI; pure Logik in `email-format-engine.ts` (keine Obsidian-Imports); Tests in `tests/sdd_email-attachment-selection/` (eine Datei pro Kriterium); Modal-Tests headless über den `__stubEl`-Recording-Stub (`tests/helpers/obsidian-stub.ts`).
- `email-filing-feature.ts` ruft ausschließlich `formatThreadSection` auf (production path); `formatEmailSection` existiert nur noch für Tests und einen Kommentarverweis in `email-routing.ts` — beide Formatierer bleiben unangetastet (siehe Architecture, M3).

## Architecture

Kein neuer Baustein. Die Vorbelegung ist eine pure Funktion in der bestehenden Engine (`email-format-engine.ts`); das Modal rendert pro Anhang eine zusätzliche Checkbox-Zeile statt der bisherigen read-only `<p>`; die Feature-Schicht (`email-filing-feature.ts`) übersetzt zwischen `ThreadSectionMessage`/`MailAttachment` und den Modal-Typen (`toPreviewMessages`) und wendet das Nutzerergebnis vor dem Save-Schritt an (`applyPreviewResults`).

Datenfluss: `applyPreviewResults(assembled.messages, results)` wird im Modal-Confirm-Callback aufgerufen — also **bevor** `commitThread`/`commitSelectedThread` überhaupt aufgerufen werden (Aufrufstellen: die `void this.commitThread(meta, assembled, this.applyPreviewResults(...), vorgang)`-Calls in `email-filing-feature.ts`, analog für den Selected-Thread-Pfad). Ihr Rückgabewert (die gefilterten `ThreadSectionMessage[]`) wird als `contentMessages`-Parameter an `commitThread`/`commitSelectedThread` übergeben. Diese reichen `contentMessages` unverändert an `saveThreadAttachments` (Base-Schritt 4, `commitThread` Zeile ~553, `commitSelectedThread` Zeile ~860) weiter, danach an `formatThreadSection` zur Zeilen-Formatierung. `formatThreadSection` emittiert die `Anhänge:`-Zeile bereits nur bei `msg.attachments.length > 0` (email-format-engine.ts:230–231) — dies ist der produktiv relevante Guard, da `email-filing-feature.ts` ausschließlich `formatThreadSection` aufruft. `formatEmailSection` hat denselben Guard (email-format-engine.ts:157–159), wird aber von der Feature-Schicht nirgends aufgerufen (nur aus Tests). Da `applyPreviewResults` die Anhang-Liste vor dieser Weiterleitung filtert, fällt M3 (Zeile entfällt bei komplett abgewählten Anhängen) als reine Konsequenz der Filterung heraus — keine Änderung an den Formatierern nötig.

## Requirements

### Added

- A1. Eine pure Funktion `preselectAttachment(att: MailAttachment): boolean` in `email-format-engine.ts` shall die Checkbox-Vorbelegung bestimmen: Nicht-Bilder → `true`; Bilder → `true` nur bei `size >= 500_000` (interne Konstante `IMAGE_PRESELECT_MIN_BYTES = 500_000`, kein Setting). Bild-Erkennung: `att.mimeType.toLowerCase()` beginnt mit `"image/"` (Vergleich case-insensitive, da `mimeType`-Schreibweise über Mail-Versionen variieren kann); bei leerem `mimeType` Fallback über die Dateiendung von `att.name`. **Dateiendung-Extraktion:** Substring nach dem letzten `.` in `att.name`, case-insensitiv verglichen gegen die Whitelist `jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|svg|avif|jfif`; enthält `att.name` kein `.`, gibt es keine Endung — dieser Fall gilt als Nicht-Bild (`true`). Unbekannte Größe (`size < 0`) zählt bei Bildern als klein → `false`; Nicht-Bilder mit unbekannter Größe → `true`. Diese Whitelist ist bewusst eine eigene, von `INLINE_IMAGE_NAME` unabhängige Liste (siehe Decision Log).
- A2. `PreviewMessage` shall statt `attachmentsLine: string | null` ein Feld `attachments: { name: string; preselected: boolean }[]` tragen (leeres Array = keine Anhänge). Das Modal rendert die Anhang-Sektion einer Nachricht nur wenn `attachments.length > 0`: einen Container `row.createEl("div", { cls: "lukit-email-preview-atts" })` — eingefügt **nach dem `<textarea>`-Element** (gleiche Position wie die bisherige `<p>`-Zeile) —, darin pro Anhang eine Zeile `attsContainer.createEl("label", { cls: "lukit-email-preview-attachment" })`, die ein `<input type=checkbox>` (`checked = preselected`) und einen `<span>` mit dem Anhang-Namen als reinem Text (kein editierbares Feld) enthält. Für eine Nachricht ohne Anhänge entsteht kein Container und keine Zeile.
- A3. `PreviewMessageResult` shall ein Feld `attachmentsIncluded: boolean[]` erhalten — positional zur `attachments`-Reihenfolge der jeweiligen Nachricht (positional statt namensbasiert: doppelte Namen innerhalb einer Nachricht sind möglich). Für eine Nachricht ohne Anhänge ist der Wert `[]` (nicht `undefined`). Das Modal liest die Checkbox-Zustände unabhängig vom Include-Zustand der Nachricht aus — `attachmentsIncluded` spiegelt immer die tatsächlichen Checkbox-Häkchen, auch wenn die Nachricht selbst abgewählt ist (Ausschluss abgewählter Nachrichten ist ein Feature-Schicht-Anliegen, siehe A5).
- A4. Das Abwählen der Nachricht-Checkbox shall zusätzlich zu den bestehenden Effekten (Textarea disabled) auch alle Anhang-Checkboxen der Nachricht deaktivieren (`disabled = true`); beim Wieder-Anwählen werden sie wieder aktiv (`disabled = false`), der Häkchen-Zustand (`checked`) bleibt dabei unverändert erhalten.
- A5. `applyPreviewResults` shall pro eingeschlossener Nachricht (`result.included === true`) das `attachments`-Array des zugehörigen `ThreadSectionMessage` positional gegen `result.attachmentsIncluded` filtern — `attachmentsIncluded[j]` entspricht `PreviewMessage.attachments[j]`, welches 1:1 in derselben Reihenfolge aus `ThreadSectionMessage.attachments` gebaut wird (durch `toPreviewMessages`). Für eine abgewählte Nachricht (`result.included === false`) werden gar keine Anhänge übernommen, unabhängig vom Checkbox-Zustand ihrer Anhänge. Die Iteration läuft über `attachments.length`: Ist `attachmentsIncluded` kürzer, gelten fehlende Indizes als abgewählt (`false`); ist es länger (beide Fälle sollten nicht vorkommen, defensiv abgesichert), werden überzählige Einträge ignoriert. Datenfluss: `applyPreviewResults` läuft im Modal-Confirm-Callback, bevor `commitThread`/`commitSelectedThread` aufgerufen werden; ihr Rückgabewert (`contentMessages`) ist der Eingabeparameter dieser Funktionen und wird dort unverändert an `saveThreadAttachments` (Base-Schritt 4) weitergereicht — alle nachfolgenden Base-Schritte (4–9: Save, Wikilink-Auflösung, Zeilen-Formatierung) operieren nur noch auf den angehakten Anhängen.

### Modified

- M1 (Base R4). Vorher: „Nur Anhänge der im Preview eingeschlossenen Nachrichten werden gespeichert." Nachher: zusätzlich werden innerhalb einer eingeschlossenen Nachricht nur die **angehakten** Anhänge gespeichert. `filterAttachments` bleibt Vorstufe (Base unverändert).
- M2 (Base R9). Vorher: „Die Read-only-Header im EmailPreviewModal (inkl. Anhänge-Zeile) bleiben unverändert." Nachher: die read-only `Anhänge:`-Zeile im Modal wird durch die Checkbox-Liste ersetzt; die Anhang-NAMEN bleiben read-only (nicht editierbar — `message://`-Integrität der Header bleibt unberührt), die Wikilink-Ersetzung passiert weiterhin erst beim Schreiben in den Vorgang.
- M3 (Base R5). Vorher: Zeile listet gespeicherte als Wikilink und nicht gespeicherte als Klartext. Nachher: die Zeile listet nur noch **übernommene** (angehakte) Anhänge — gespeicherte als Wikilink, Save-Fehler-Degradation als Klartext (Base R6 unverändert); abgewählte erscheinen gar nicht. Hat eine Nachricht keine übernommenen Anhänge, entfällt ihre `Anhänge:`-Zeile. Dies erfordert **keine** Codeänderung an `formatAttachmentsLine`/`formatEmailSection`/`formatThreadSection` — der bestehende `attachments.length > 0`-Guard in `formatThreadSection` (email-format-engine.ts:230–231, produktiv relevant) bzw. `formatEmailSection` (email-format-engine.ts:157–159, nur testseitig relevant) produziert dieses Verhalten bereits, sobald die Aufrufer die vorgefilterte (angehakte) Liste übergeben (siehe A5, Architecture).

### Removed

Keine.

## File & Module Structure

- `src/features/email-filing/email-format-engine.ts` — neu: `preselectAttachment` + Konstante `IMAGE_PRESELECT_MIN_BYTES` (pure). Keine Änderung an `formatAttachmentsLine`/`formatEmailSection`/`formatThreadSection` (siehe M3).
- `src/features/email-filing/email-preview-modal.ts` — `PreviewMessage.attachments` (ersetzt `attachmentsLine`), `PreviewMessageResult.attachmentsIncluded`, Checkbox-Rendering (Container `lukit-email-preview-atts` + Zeilen `lukit-email-preview-attachment`) + Disable-Kopplung an die Nachricht-Checkbox.
- `src/features/email-filing/email-filing-feature.ts` — `toPreviewMessages` baut `attachments` mit `preselectAttachment`-Vorbelegung (Signatur unverändert, nur die Objektliteral-Konstruktion ändert sich); `applyPreviewResults` filtert die Anhänge der `ThreadSectionMessage`s gemäß `attachmentsIncluded` (Signatur unverändert, nur die Body-Logik ändert sich).
- `tests/helpers/obsidian-stub.ts` — `__stubEl` erweitern: (a) jedes erzeugte Element bekommt ein `style: {}`-Objekt (das Modal setzt `textarea.style.width` in `onOpen()` — ohne `style` wirft jeder headless-Test vor Erreichen der Anhang-Logik); (b) `addEventListener` zeichnet Callbacks statt No-op zu sein: `el.__listeners = el.__listeners ?? {}`, `addEventListener: (type: string, fn: (...args: any[]) => void) => { (el.__listeners[type] ??= []).push(fn); }`, plus ein Auslöse-Helper `__fireEvent(el, type)`, der alle registrierten Callbacks für `type` aufruft (analog zum bestehenden `texts`/`children`-Recording-Muster). Beide Erweiterungen sind Voraussetzung für die Phase-1-Szenarien „Nachricht abwählen → Anhang-Checkboxen disabled" und „Modal öffnen und unverändert bestätigen".
- `styles.css` — `.lukit-email-preview-atts` wechselt vom `<p>`-Textzeilen-Stil (font-smaller, text-muted) zu einem `<div>`-Container-Stil (Layout-Regeln für den Container, z. B. Abstand nach oben, keine Textfarbe/-größe mehr direkt auf dem Container); neue Regel `.lukit-email-preview-attachment` für die einzelnen Label-Zeilen (`display: flex; align-items: center; gap: var(--size-4-1);` o. ä., Checkbox + Name in einer Zeile).
- `tests/sdd_email-attachment-selection/` — Kriterien-Tests (`sdd_email-attachment-selection_p<N>_c<M>_<slug>.test.ts`).
- README.md + CLAUDE.md — Verhalten dokumentieren (Vorbelegungsregel nennen).

## Data Models

```typescript
// email-format-engine.ts
export const IMAGE_PRESELECT_MIN_BYTES = 500_000;

export function preselectAttachment(att: MailAttachment): boolean;

// email-preview-modal.ts
export interface PreviewMessage {
	header: string;
	body: string;
	attachments: { name: string; preselected: boolean }[];
}

export interface PreviewMessageResult {
	included: boolean;
	body: string;
	attachmentsIncluded: boolean[]; // positional zu PreviewMessage.attachments; [] wenn attachments leer ist
}

// email-filing-feature.ts (Signaturen unverändert gegenüber der Base-SDD; nur Body-Logik ändert sich; beide sind private Methoden der Feature-Klasse, keine freien Funktionen)
private toPreviewMessages(thread: ThreadSectionMessage[]): PreviewMessage[];
private applyPreviewResults(
	thread: ThreadSectionMessage[],
	results: PreviewMessageResult[],
): ThreadSectionMessage[];
```

## Phase 1 — Pure Vorbelegung, Modal-Checkboxen, minimale `toPreviewMessages`-Verdrahtung

`preselectAttachment` (Engine), Typ-Umbau `PreviewMessage`/`PreviewMessageResult`, Checkbox-Rendering im Modal inkl. Disable-Kopplung, `__stubEl`-Erweiterung (`style`, `addEventListener`-Recording, `__fireEvent`), plus die minimale Anpassung von `toPreviewMessages` (Objektliteral baut `attachments` statt `attachmentsLine`) — ohne diese Anpassung kompiliert `email-filing-feature.ts` nach dem Typ-Umbau nicht (der bestehende Aufruf konstruiert noch `attachmentsLine`). `applyPreviewResults` (Anhang-Filterung vor Save) bleibt in Phase 2.

Phase complete when: Szenarien unten grün; `npm run test` und `npm run build` grün — eigenständig, ohne Verweis auf noch nicht existierende Phase-2-Logik.

### Test Scenarios

- GIVEN ein PDF-Anhang (`application/pdf`, 10 KB) WHEN `preselectAttachment` darauf läuft THEN liefert es `true` (Dokumente sind immer angehakt).
- GIVEN ein PNG mit 40 KB WHEN `preselectAttachment` prüft THEN `false`; GIVEN ein JPG mit 800 KB WHEN geprüft wird THEN `true`.
- GIVEN Bilder mit exakt 500000 bzw. 499999 Bytes WHEN `preselectAttachment` prüft THEN `true` bzw. `false` (Grenzwert inklusiv).
- GIVEN leerer `mimeType` und Name `logo.png` (40 KB) WHEN geprüft wird THEN `false` (Extension-Fallback); GIVEN leerer `mimeType` und Name `vertrag.pdf` WHEN geprüft wird THEN `true`.
- GIVEN leerer `mimeType` und ein Name ohne `.` (z. B. `"IMG1234"`, 40 KB) WHEN geprüft wird THEN `true` (keine Endung erkennbar → gilt als Nicht-Bild).
- GIVEN `mimeType: "IMAGE/PNG"` (Großschreibung) und 40 KB WHEN geprüft wird THEN `false` (case-insensitiver Präfix-Vergleich greift genauso wie bei Kleinschreibung).
- GIVEN ein Bild mit `size: -1` WHEN geprüft wird THEN `false`; GIVEN ein Nicht-Bild mit `size: -1` WHEN geprüft wird THEN `true`.
- GIVEN `PreviewMessage`s mit gemischten `preselected`-Werten WHEN das Modal geöffnet und unverändert bestätigt wird THEN enthält jedes `PreviewMessageResult.attachmentsIncluded` exakt die `preselected`-Werte in derselben Reihenfolge (headless via `__stubEl`).
- GIVEN eine Nachricht wird über ihre Nachricht-Checkbox abgewählt WHEN der Zustand geprüft wird THEN sind alle Anhang-Checkboxen dieser Nachricht `disabled`; WHEN sie wieder angewählt wird THEN sind die Anhang-Checkboxen wieder aktiv mit unverändertem Häkchen-Zustand.
- GIVEN eine Nachricht mit `included: false` und gemischt gesetzten Anhang-Checkboxen WHEN das Modal bestätigt wird THEN spiegelt `attachmentsIncluded` weiterhin exakt die Checkbox-Zustände wider (das Modal filtert nicht nach Nachricht-Inklusion — das ist Phase-2/Feature-Schicht-Anliegen, siehe A3/A5).
- GIVEN eine Nachricht ohne Anhänge (`attachments: []`) WHEN das Modal rendert THEN entsteht keine Anhang-Sektion für diese Nachricht (kein `createEl` mit `cls: "lukit-email-preview-atts"` für diesen Nachrichten-Block im `__stubEl`-Recording) UND ihr `attachmentsIncluded` im Ergebnis ist `[]`.
- GIVEN eine Anhang-Checkbox-Zeile WHEN sie gerendert wird THEN ist der Anhang-Name als reiner `<span>`-Text ohne editierbares Eingabefeld dargestellt (deckt M2 explizit ab).
- GIVEN eine Thread-Nachricht mit `logo.png` (40 KB, `image/png`) und `vertrag.pdf` (`application/pdf`) WHEN `toPreviewMessages` darauf läuft THEN enthält das resultierende `PreviewMessage.attachments` beide Namen mit `preselected: false` bzw. `true`.
- GIVEN der Typ-Umbau ist umgesetzt WHEN `grep -rn "attachmentsLine" src/features/email-filing/` läuft THEN liefert er keine Treffer mehr (Regressions-Pin: das alte Feld ist vollständig entfernt, kein toter Code bleibt zurück).

## Phase 2 — Feature-Verdrahtung: Filtern vor Save und Zeile

`applyPreviewResults` (Anhang-Filter vor Base-Schritt 4), M3-Zeilenverhalten (Konsequenz der Filterung, kein Engine-Code nötig), Doku.

Phase complete when: Szenarien unten grün; README/CLAUDE.md aktualisiert; `npm run test` und `npm run build` grün.

### Test Scenarios

- GIVEN ein Preview-Ergebnis, das `logo.png` abwählt und `vertrag.pdf` angehakt lässt WHEN `applyPreviewResults` und danach `commitThread` laufen THEN enthält der `saveAttachments`-Call nur `vertrag.pdf`, und die Vorgang-Zeile lautet `Anhänge: [[vertrag.pdf]]` — `logo.png` erscheint nirgends (Zeile, Dateisystem, Wikilink).
- GIVEN alle Anhänge einer eingeschlossenen Nachricht sind abgewählt WHEN `commitThread` läuft THEN erfolgt für diese Nachricht kein `saveAttachments`-Call, und ihre `Anhänge:`-Zeile entfällt vollständig — die restliche Nachricht (Body, Header) wird unverändert übernommen.
- GIVEN eine Nachricht ist vollständig abgewählt (`result.included === false`), unabhängig vom Checkbox-Zustand ihrer Anhänge, WHEN `commitThread` läuft THEN werden keine ihrer Anhänge gespeichert oder gelistet — der Nachricht-Ausschluss hat Vorrang vor dem Anhang-Häkchen-Zustand.
- GIVEN alle Anhänge angehakt bleiben (Default-Vorbelegung unverändert bestätigt) WHEN `commitThread` läuft THEN entspricht das Verhalten exakt dem Base-SDD (Save + Wikilink; Save-Fehler → Klartext) — Regressionstest.
- GIVEN das Einzel-Kommando `commitSelectedThread` mit teilweise abgewählten Anhängen WHEN es läuft THEN gilt dasselbe Filterverhalten wie bei `commitThread` (kein Archivieren, wie gehabt).
- GIVEN der nicht-interaktive Pfad `fileEmailIntoVorgang` (kein Preview-Modal) WHEN er läuft THEN werden weiterhin alle (post-`filterAttachments`) Anhänge übernommen — keine Vorbelegungslogik greift ohne UI (Regression-Pin).
- GIVEN eine Nachricht mit zwei Anhängen desselben Namens, von denen nur einer angehakt ist WHEN `applyPreviewResults` läuft THEN wird die positionale Zuordnung (`attachmentsIncluded[i]` ↔ `attachments[i]`) korrekt angewendet — der angehakte Eintrag bleibt, der andere entfällt, unabhängig vom Namen.
- GIVEN `attachmentsIncluded` ist kürzer als `attachments` (defensiv, sollte nicht vorkommen) WHEN `applyPreviewResults` läuft THEN werden die fehlenden Indizes als abgewählt (`false`) behandelt — keine Exception, keine übernommenen Anhänge für die fehlenden Indizes.
- GIVEN `attachmentsIncluded` ist länger als `attachments` (defensiv, sollte nicht vorkommen) WHEN `applyPreviewResults` läuft THEN werden die überzähligen Einträge ignoriert — keine Exception, Ergebnis entspricht der Filterung nach `attachments.length`.

## Decision Log

- **C statt A oder B**: reine Checkboxen (A) verlagern die Arbeit auf jeden Walk; reine Heuristik (B) irrt unsichtbar. Checkboxen mit Vorbelegung machen den Normalfall klickfrei und Fehlgriffe sichtbar-korrigierbar. *(Vom Nutzer bestätigt.)*
- **Abgewählte ganz weglassen** (statt Klartext-Listung): wer Footer-Müll abwählt, will ihn auch nicht als Textliste im Vorgang; `message://` bleibt der Weg zum Original. *(Vom Nutzer bestätigt.)*
- **Schwelle 500 KB als interne Konstante, kein Setting**: YAGNI; nachjustierbar per Code-Änderung. Grenzwert inklusiv (≥).
- **Bilder mit unbekannter Größe (`-1`) abgehakt**: die Vorbelegung darf konservativ „aus" sein, weil sie sichtbar ist — ein Klick korrigiert; Footer-Müll hat fast immer lesbare Größe.
- **`attachmentsIncluded` positional (boolean[]) statt namensbasiert**: doppelte Anhang-Namen innerhalb einer Nachricht sind möglich (bekannte savedNames-Map-Grenze der Base-SDD wird nicht verschärft).
- **Checkbox-Liste ersetzt die read-only Zeile im Modal** (Weiterentwicklung von Base R9): Namen bleiben nicht editierbar — die ursprüngliche Begründung (message://-Integrität) betraf die Header und bleibt gewahrt.
- **`fileEmailIntoVorgang` unverändert**: nicht-interaktiver Wrapper (Tests) — Vorbelegung ohne sichtbare Checkboxen wäre Heuristik B durch die Hintertür.
- **`mimeType`-Präfixvergleich case-insensitive**: konsistent zum bereits case-insensitiven Extension-Fallback; verschiedene Mail-Versionen liefern `mimeType` nicht garantiert kleingeschrieben.
- **Extension-Fallback-Liste erweitert um `avif`/`jfif`**: beide sind plausible moderne Bild-Anhänge/Screenshots; kein YAGNI-Verstoß, da die Liste weiterhin ein begrenztes Whitelist bleibt.
- **`attachmentsIncluded`-Längenabweichung defensiv statt fehlerwerfend**: sollte nie vorkommen (1:1-Konstruktion durch `toPreviewMessages`), aber ein defensiver Fallback (fehlende/überzählige Indizes werden ignoriert statt zu werfen) ist billiger als eine Exception, die den ganzen Filing-Vorgang abbrechen würde.
- **M3 erfordert keine Änderung an den Formatierern**: der bestehende `attachments.length > 0`-Guard in `formatThreadSection` (produktiv relevant) und `formatEmailSection` (nur testseitig relevant) reicht, sobald `applyPreviewResults` die Liste vor der Weiterleitung filtert (Phase 2 ist reine Verdrahtung, kein Engine-Code für M3).
- **Phase 1 umfasst die minimale `toPreviewMessages`-Anpassung** (statt vollständig in Phase 2): sonst kompiliert `email-filing-feature.ts` nach dem Typ-Umbau von `PreviewMessage` nicht — Phase 1 muss für sich `npm run build` bestehen.
- **A1-Extension-Whitelist bewusst getrennt von `INLINE_IMAGE_NAME`**: `INLINE_IMAGE_NAME` erkennt Auto-generierte Inline-Bild-Namen (`image001.png`) als Vorfilter-Kriterium; A1s Whitelist erkennt generisch, ob ein Dateiname überhaupt ein Bild ist (Vorbelegungs-Kriterium). Unterschiedliche Zwecke, keine gemeinsame Konstante sinnvoll.
- **Kein bestehender Test bricht durch den Typ-Umbau**: grep-verifiziert (`grep -rn "attachmentsLine\|PreviewMessage\|EmailPreviewModal" tests/`) — kein Treffer, also referenziert kein bestehender Test diese Symbole.

## Open Decisions

Keine.

## Out of Scope

- Nachträgliches Ändern der Anhang-Auswahl nach dem Ablegen.
- Persistente Lern-Heuristik („dieser Absender-Footer immer abwählen").
- Änderungen an `filterAttachments` (Inline-Bild-Erkennung) oder an der Save-/Kollisions-Mechanik der Base-SDD.
- Vorschau der Anhang-Inhalte (Thumbnails) im Modal.
