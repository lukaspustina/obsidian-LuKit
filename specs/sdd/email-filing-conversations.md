# SDD: Email Filing — Conversations & Sent Messages (v2 addendum)

Status: Draft
Created: 2026-06-30
Extends: specs/sdd/email-filing.md (Phases 1–4, implemented)

## Overview

Extends the email-filing feature so a filed Vorgang captures the **whole conversation**, not just received messages. When an inbound email is filed, the feature assembles the thread (the inbound message + the user's Sent replies) and inserts it as one chronological section, de-duplicated against what the Vorgang already contains. Adds a single-shot "File selected Mail message" command to capture threads with no inbound trigger (e.g. messages the user initiated), and cross-session routing suggestions mined from existing Vorgänge. No per-email notes are created — the Vorgänge remain the single source of truth.

## Context & Constraints

- Builds on the implemented base feature (`src/features/email-filing/`): the inbox walk, `MailBridge`, pure engines, `SectionNoteSuggestModal` keyboard scheme, in-walk routing/skip caches.
- **Mail scripting cannot expose `References`/`In-Reply-To` headers**, so threads are identified heuristically by **correspondent address + normalized subject (`threadKey`)**. The editable preview is the backstop for mismatches.
- **The Vorgänge already record what's filed**: each filed message leaves a `- siehe […](message://%3C<id>%3E)` link encoding its Message-ID, and `##### E-Mail von <sender>` headings encode the correspondent. Dedup and cross-session routing mine this — **no new vault storage**. Persistent caches, if needed, live in plugin data (`data.json`, via `loadData`/`saveData`) — **not** in the vault and **not** per-email notes.
- macOS/Apple Mail only; bridge via `osascript` JXA (`child_process.execFile`, argv-passed values).

## Requirements

1. When the user files an inbound message into a Vorgang, the system shall assemble the thread: the inbound message plus the user's Sent messages in the same thread, matched by **correspondent email address** and **`threadKey`** (normalized subject), ordered chronologically by sent date.
2. The system shall exclude from assembly any message whose Message-ID already appears as a `message://` link in the **target Vorgang's current content** (de-duplication within and across sessions).
3. The system shall render the assembled conversation as one h5 section whose body contains, per message, a sub-header indicating date + party + direction (`eingegangen`/`gesendet`), the (stripped) body, and the message's `message://` link.
4. After filing a thread, the system shall record its `threadKey` so the walk auto-skips that thread's remaining inbox messages (reusing the auto-skip mechanism).
5. The system shall register a command "E-Mail: File selected Mail message" that files the message(s) currently selected in Apple Mail (any mailbox, including Sent) and their assembled thread into a chosen Vorgang, **without archiving** (capture-only).
6. The system shall, at the start of a walk or single-shot, build a filing corpus by mining existing section-note contents for prior email filings (`E-Mail von <sender>` headings → that note), and feed it to `suggestFilingTargets` so ongoing correspondents/threads route consistently across sessions. The corpus shall be cached in plugin data and reused/refreshed to avoid rescanning every invocation.
7. The system shall not create per-email notes; the Vorgänge and the (hidden) plugin-data cache are the only persistence.
8. Sent messages shall never be archived or moved; only the inbound message of a filed thread is archived (by the existing walk contract). The single-shot command archives nothing.

## Architecture

```
Inbox walk — on Pick (file):
  bridge.listSentForThread(account, correspondentAddr, threadKey)   [osascript JXA]
     → user's Sent messages in the thread (id, date, body, attachments)
  extractFiledMessageIds(targetVorgangContent)  (pure)  → already-filed Set
  assemble = [inbound] + sentReplies,  minus already-filed,  sorted by date
  formatThreadSection(assemble, locale)  (pure)  → { sectionName, bodyLines }
  addVorgangSection(...) → vault.modify         (existing)
  record threadKey in the auto-skip set         (existing mechanism)

Single-shot "File selected Mail message":
  bridge.getSelection()  [osascript JXA]  → selected message(s) (+ direction, correspondent)
  for each: assemble thread (as above), pick Vorgang, file — NO archive

Cross-session routing (walk/command start):
  corpus = mineVorgangFilings(section-note contents)  (pure parse, cached in data.json)
  suggestFilingTargets(title, corpus + in-walk records, candidates, …)  (existing)
```

## Data Models

```ts
// mail-bridge.ts — additions

// RawMailMessageMeta gains the correspondent's address (needed to match Sent).
export interface RawMailMessageMeta {
  id: string;
  accountName: string;
  senderName: string;
  senderAddress: string;   // NEW — correspondent address for inbound messages
  subject: string;
  dateSent: string;
}

export interface ThreadMessage {
  id: string;
  direction: "in" | "out";
  partyName: string;       // sender (in) or primary recipient (out) display name
  dateSent: string;        // ISO 8601
  body: string;            // raw; parsed/stripped by the engine
  attachments: MailAttachment[];
  messageUrl: string;      // built via buildMessageUrl(id)
}

export interface SelectedMessage {
  id: string;
  accountName: string;
  direction: "in" | "out"; // derived from the message's mailbox
  subject: string;
  partyName: string;
  partyAddress: string;    // correspondent (sender if in, recipient if out)
  dateSent: string;
}

export interface MailBridge {
  // …existing…
  /** Sent messages in the named account whose recipient matches correspondentAddress
   *  and whose normalized subject matches threadKey, with bodies + attachments. */
  listSentForThread(accountName: string, correspondentAddress: string, threadKey: string): Promise<ThreadMessage[]>;
  /** The message(s) currently selected in Apple Mail, across any mailbox. */
  getSelection(): Promise<SelectedMessage[]>;
}

// email-format-engine.ts — additions (pure)

/** Message-IDs already filed into a Vorgang, parsed from its message:// links. */
export function extractFiledMessageIds(vorgangContent: string): Set<string>;

/** Renders a chronological multi-message conversation into one section.
 *  sectionName = "E-Mail-Thread: <sanitizedStrippedSubject>"
 *  bodyLines: per message → ["**<DD.MM.> — <party> (eingegangen|gesendet):**",
 *             "- siehe [<…>](message://…)", ...body lines, "Anhänge: …"], blank-separated. */
export function formatThreadSection(
  messages: Array<{ direction: "in" | "out"; partyName: string; dateSent: Date; body: string; attachments: MailAttachment[]; messageUrl: string }>,
  subject: string,
  locale: DateLocale,
): { sectionName: string; bodyLines: string[] };

// email-routing.ts — new pure module

export interface MinedFiling { correspondent: string; subject: string; target: string; }
/** Parses a section note's content for prior email filings (E-Mail von <sender>
 *  headings + their section subjects) → records for the suggestion corpus. */
export function mineVorgangFilings(content: string, basename: string): MinedFiling[];

// email-filing-settings.ts — addition (cached corpus lives in plugin data)
export interface EmailFilingSettings {
  // …existing…
  /** Cached cross-session routing corpus (mined from Vorgänge). Not vault content. */
  routingCache?: { builtAt: string; records: FiledRecord[] };
}
```

## Configuration

- No new user-facing settings. `emailFiling.routingCache` is an internal plugin-data cache (refreshed when stale, e.g. older than a configurable internal TTL or on demand).

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---------|---------|-----------|--------------|
| Sent search fails | JXA error reading Sent mailbox | File the inbound message alone (no thread enrichment) | Notice: "Gesendete Nachrichten konnten nicht geladen werden – nur die eingegangene E-Mail abgelegt." |
| No selection | "File selected" with nothing selected in Mail | Return | Notice: "Keine Nachricht in Mail ausgewählt." |
| Vorgang read fails | dedup can't read target | Proceed without dedup (may duplicate) | Notice: "Konnte „<name>" nicht auf Duplikate prüfen." |
| Corpus mine fails | parsing error | Degrade to in-walk routing only | console.warn (PII-safe), no Notice |

## Implementation Phases

## Phase 1 — Conversation assembly & dedup

Add `senderAddress` to inbox metadata and `listSentForThread` to the bridge. Add pure `extractFiledMessageIds` and `formatThreadSection`. In the walk's file path, assemble inbound + Sent replies, dedup against the target Vorgang, render one chronological section, and record the `threadKey` in the auto-skip set.

Phase complete when: unit tests for `extractFiledMessageIds` and `formatThreadSection` pass; an acceptance test (fake bridge) verifies a filed thread contains both directions, excludes already-linked ids, and adds the threadKey to the auto-skip set; `npm run test` + `npm run build` green.

### Test Scenarios
- GIVEN a Vorgang already containing `message://%3Cm1%3E`, WHEN `extractFiledMessageIds(content)`, THEN the set contains `m1`.
- GIVEN an inbound message `m2` from Alice and a Sent reply `m3` to Alice with the same `threadKey`, WHEN filing into a Vorgang that already links `m1` (older, same thread), THEN the new section contains `m2` and `m3` in date order and not `m1`.
- GIVEN `listSentForThread` rejects, WHEN filing, THEN the inbound message is filed alone and a Notice explains Sent could not be loaded.
- GIVEN a thread is filed, WHEN the walk reaches another inbox message of that thread, THEN it is auto-skipped.

## Phase 2 — Single-shot "File selected Mail message"

Add `getSelection` to the bridge and a command that assembles the selected message's thread (correspondent = recipient for outbound, sender for inbound), opens the picker + preview, and files into the chosen Vorgang **without archiving**. Dedups against the target Vorgang.

Phase complete when: acceptance test (fake bridge) verifies the command files the selection's thread without calling `archive`, and the empty-selection path shows the Notice; `npm run test` + `npm run build` green.

### Test Scenarios
- GIVEN a selected outbound message to Bob (no inbound counterpart), WHEN the command runs and a Vorgang is picked, THEN the thread is filed and `archive` is never called.
- GIVEN nothing selected, WHEN the command runs, THEN a "Keine Nachricht ausgewählt" Notice shows and nothing is filed.
- GIVEN a selected message whose id already links in the target Vorgang, WHEN filed, THEN it is not duplicated.

## Phase 3 — Cross-session routing (mine Vorgänge + plugin-data cache)

Add pure `mineVorgangFilings`. At walk/single-shot start, build a `FiledRecord[]` corpus by mining section-note contents (cached in `emailFiling.routingCache`, refreshed when stale), and pass it (combined with the in-walk records) to `suggestFilingTargets`.

Phase complete when: unit tests for `mineVorgangFilings` pass; an acceptance test verifies suggestions reflect a correspondent filed into a Vorgang in a prior session (via the mined corpus); existing suggestion tests still pass; `npm run test` + `npm run build` green.

### Test Scenarios
- GIVEN a Vorgang note containing `##### E-Mail von Alice: Angebot, 01.06.2026`, WHEN `mineVorgangFilings(content, "Müller GmbH")`, THEN it yields a record `{ correspondent/subject → "Müller GmbH" }`.
- GIVEN a mined corpus routing Alice → "Müller GmbH", WHEN a new email from Alice is ranked, THEN "Müller GmbH" is suggested even with an empty in-walk cache.
- GIVEN existing besprechung/email suggestion tests, WHEN run, THEN all pass.

## Decision Log

- **Vorgänge are the record (no new vault storage for dedup/routing).** Filed `message://` ids and `E-Mail von` headings already encode what's filed and to whom; dedup reads the target Vorgang, routing mines section-note contents. Chosen over a vault ledger/per-email notes ("doubles", rejected).
- **Persistence, where needed, lives in `data.json` (plugin data), not the vault.** A hidden routing cache is not a vault note and not a "double"; it respects "no additional storage in the vault." Chosen over a visible vault log note.
- **Thread identity = correspondent address + `threadKey`.** `References`/`In-Reply-To` headers are not exposed to Mail scripting; subject+correspondent is the tightest available signal. Subject-only over-groups on generic subjects. The preview is the backstop.
- **Assemble inbound + Sent only; do not reconstruct from Archive.** Reaching into Archive for older received messages risks re-including content filed in a prior session that the target dedup can't always catch (other Vorgänge). Dedup against the target plus pulling Sent covers the live conversation; Archive reconstruction is rejected.
- **Sent messages are never archived/moved.** Archiving is an inbox-zero action on received mail; Sent stays in Sent. The single-shot command archives nothing (capture-only).
- **"Reply, then file" is the intended habit.** A Sent reply is pulled only if it exists when the inbound message is filed; filing after replying captures it. Documented, not enforced.

## Open Decisions

1. **Routing cache freshness.** Rebuild the mined corpus every Nth invocation, on a time TTL, or only on an explicit "rebuild" action? Impact: staleness vs rescual cost. Lean: time TTL (e.g. rebuild if older than a day) plus rebuild after any filing.
2. **Single-shot on a received inbox selection.** Should "File selected" also archive when the selection happens to be an inbox message (matching walk behavior), or stay strictly capture-only? Lean: strictly capture-only (predictable; the walk is the archiving path).

## Out of Scope

- A full **Sent-mailbox walk** (triaging all sent mail). The single-shot command covers initiated threads on demand.
- **`References`-based** threading (not scriptable).
- **Cross-Vorgang dedup** (a message may legitimately belong to two Vorgänge); dedup is per-target.
- Attachment **content** extraction; HTML→markdown (still deferred).
- Per-email notes / visible vault ledger.
