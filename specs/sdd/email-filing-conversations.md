# SDD: Email Filing — Conversations & Sent Messages (v2 addendum)

Status: Ready for Implementation
Original: specs/sdd/email-filing-conversations.md
Refined: 2026-06-30
Extends: specs/sdd/email-filing.md (Phases 1–4, implemented)

## Overview

Extends the email-filing feature so a filed Vorgang captures the whole conversation, not just received messages. When an inbound email is filed, the feature assembles the thread (the inbound message + the user's Sent replies) and inserts it as one chronological section, de-duplicated against what the Vorgang already contains. Adds a single-shot "File selected Mail message" command to capture threads with no inbound trigger (e.g. messages the user initiated), and cross-session routing suggestions mined from existing Vorgänge. No per-email notes are created — the Vorgänge remain the single source of truth.

## Context & Constraints

- Builds on the implemented base feature (`src/features/email-filing/`): the inbox walk, `MailBridge`, pure engines, `SectionNoteSuggestModal` keyboard scheme, in-walk routing/skip caches.
- **Mail scripting cannot expose `References`/`In-Reply-To` headers**, so threads are identified heuristically by **correspondent address + normalized subject (`threadKey`)**. The editable preview is the backstop for mismatches.
- **The Vorgänge already record what's filed**: each filed message leaves a `- siehe [E-Mail von <sender>: <subject>](message://%3C<id>%3E)` link (angle-bracketed, percent-encoded id, built by `buildMessageUrl`), and `##### E-Mail von <sender>` headings encode the correspondent. Dedup and cross-session routing mine this — **no new vault storage**. Persistent caches live in plugin data (`data.json`, via `loadData`/`saveData`) — **not** in the vault and **not** per-email notes.
- macOS/Apple Mail only; bridge via `osascript` JXA (`child_process.execFile`, argv-passed values).
- **Bridge mailbox scope:** The existing `lukitFindInInbox` helper searches only the INBOX mailbox. `listSentForThread` must search the account's Sent mailbox (configured per account in `sentMailboxes`). `getSelection` reads `selection of Mail` across any open mailbox. These are noted explicitly because the implementations differ.
- **threadKey matching:** `listSentForThread` JXA returns all Sent messages to the named correspondent in the configured Sent mailbox. The TS layer then filters by `threadKey` using `stripSubjectPrefixes` (already imported from `email-format-engine.ts`) — no normalization inside JXA. This is consistent with the existing engine and keeps the JXA scripts simple and testable.
- **Bridge methods with no CI gate:** `listSentForThread` and `getSelection` are validated by manual smoke test only (same pattern as base bridge Phases 3). The pure engines (`extractFiledMessageIds`, `formatThreadSection`, `mineVorgangFilings`) and feature flows (fake `MailBridge`) ARE unit/acceptance tested.

## Requirements

1. When the user files an inbound message into a Vorgang, the system shall assemble the thread: the inbound message plus the user's Sent messages in the same thread, matched by **correspondent email address** and **`threadKey`** (normalized subject via `stripSubjectPrefixes`), ordered chronologically by sent date.
2. The system shall exclude from assembly any message whose Message-ID already appears as a `message://` link in the **target Vorgang's current content** (de-duplication within and across sessions). `extractFiledMessageIds` parses links of the form `message://%3C<id>%3E` (angle brackets percent-encoded by `buildMessageUrl`) and URL-decodes each captured id via `decodeURIComponent`.
3. The system shall render the assembled conversation as one h5 section whose body contains, per message in date order, a sub-header `**<DD.MM.YYYY> — <partyName> (eingegangen|gesendet):**`, the message body (stripped by `parseEmailBody`), a `- siehe [E-Mail von <partyName>: <strippedSubject>](<messageUrl>)` link, and an `Anhänge: <names>` line when attachments are present; messages are blank-line separated.
4. After filing a thread, the system shall record its `threadKey` in the walk's `skippedThreads` set so the walk auto-skips remaining inbox messages of that thread (reusing the existing mechanism).
5. The system shall register a command "E-Mail: File selected Mail message" that files the message(s) currently selected in Apple Mail (any mailbox, including Sent) and their assembled thread into a chosen Vorgang, **without archiving** (capture-only). Archiving is never performed by this command, regardless of which mailbox the selected message came from.
6. The system shall, at the start of a walk or single-shot command, build a `FiledRecord[]` corpus by mining existing section-note contents for prior email filings (`E-Mail von <sender>` headings → target note basename), and feed the combined corpus (mined + in-walk records) to `suggestFilingTargets`. The mined corpus is cached in `emailFiling.routingCache` in plugin data and is rebuilt when `routingCache.builtAt` is older than 24 hours (hardcoded constant `ROUTING_CACHE_TTL_MS = 24 * 60 * 60 * 1000` in `email-routing.ts`) or when no cache exists. The cache is also rebuilt after every successful filing (to reflect the just-filed record immediately). `section notes` for mining are all `TFile`s whose frontmatter tags include any of `Vorgang`, `Person`, `Bestellung`, `Bewerbung` — the same set `SectionNoteSuggestModal` lists as candidates.
7. The system shall not create per-email notes; the Vorgänge and the hidden plugin-data routing cache are the only persistence.
8. Sent messages shall never be archived or moved; only the inbound message of a filed thread is archived (by the existing walk contract). The single-shot command archives nothing.

## Architecture

```
Inbox walk — on Pick (file):
  bridge.listSentForThread(account, correspondentAddr, subject)   [osascript JXA]
     → all Sent in sentMailboxes[account] to correspondentAddr
  TS filters by threadKey(subject) === threadKey(msg.subject)
  extractFiledMessageIds(targetVorgangContent)  (pure)  → already-filed Set<string>
  assemble = [inbound, ...sentReplies].filter(m => !alreadyFiled.has(m.id)), sorted by dateSent
  formatThreadSection(assemble, subject, locale)  (pure)  → { sectionName, bodyLines }
  addVorgangSection(content, sectionName, locale, latestDate, bodyLines) → vault.modify
  skippedThreads.add(threadKey(subject))         (existing mechanism)

Single-shot "E-Mail: File selected Mail message":
  bridge.getSelection()  [osascript JXA]  → selected message(s) across any mailbox
  for each message (dateSent ascending):
    direction: "out" if sentMailboxes[accountName] set and mailbox.name === it (exact);
               else if no entry, "out" if mailbox.name lowercased contains "sent"; else "in"
    correspondent: partyAddress (senderAddress if "in"; first To: recipient if "out")
    assemble thread (listSentForThread + inbound if "in") → dedup → format
    SectionNoteSuggestModal (Pick + Don't-file only; no Skip, no Stop+open) → file — NO archive

Cross-session routing (called at walk/command start):
  isCacheStale(routingCache, now)  (pure, injectable now: number)
  → stale: scan all section-note TFiles, mineVorgangFilings(content, basename) per file
           write routingCache = { builtAt: now.toISOString(), records } to data.json
  → fresh: use routingCache.records
  suggestFilingTargets(title, [...routingCache.records, ...walkFiledRecords], candidates, opts)
```

## File & Module Structure

New files (in `src/features/email-filing/`):
- `email-routing.ts` — pure: `mineVorgangFilings`, `isCacheStale`, `ROUTING_CACHE_TTL_MS`
- New JXA script constants added to `mail-bridge.ts`: `LIST_SENT_FOR_THREAD_JS`, `GET_SELECTION_JS`
- New methods on `MailBridge` interface in `mail-bridge.ts`: `listSentForThread`, `getSelection`

Modified files:
- `src/features/email-filing/email-format-engine.ts` — add `extractFiledMessageIds`, `formatThreadSection`
- `src/features/email-filing/email-filing-settings.ts` — add `sentMailboxes: Record<string, string>`, `routingCache?: RoutingCache` to `EmailFilingSettings`; update `DEFAULT_EMAIL_FILING_SETTINGS`; update `mergeDetectedAccounts` to populate `sentMailboxes` alongside `archiveMailboxes`
- `src/features/email-filing/email-filing-feature.ts` — add `listSentForThread` call in file path; add single-shot command; add routing-cache load/rebuild at walk/command start; update settings UI to show `sentMailboxes` per-account field
- `src/types.ts` — update `mergeSettings` to deep-merge new `sentMailboxes` and `routingCache` fields (matching the existing `archiveMailboxes` pattern)

New test files:
- `tests/unit/email-routing.test.ts` — unit tests for `mineVorgangFilings`, `isCacheStale`
- `tests/unit/email-format-engine-thread.test.ts` — unit tests for `extractFiledMessageIds`, `formatThreadSection`
- `tests/acceptance/email-filing-conversations.test.ts` — acceptance tests for thread assembly (Phase 1), single-shot command (Phase 2), and routing-cache integration (Phase 3)

## Data Models

```ts
// src/features/email-filing/mail-bridge.ts — additions

// RawMailMessageMeta gains the correspondent's address for thread matching.
// Add to the existing interface:
export interface RawMailMessageMeta {
  // …existing fields…
  /** Sender's email address (inbound messages). Used to match Sent replies. */
  senderAddress: string;  // NEW
}

/** A message in an assembled thread (inbound or Sent reply). */
export interface ThreadMessage {
  id: string;
  /** "in" for received; "out" for Sent. Messages from listSentForThread are always "out". */
  direction: "in" | "out";
  /** Display name of the party: sender (in) or first To: recipient (out). */
  partyName: string;
  /** ISO 8601 string. */
  dateSent: string;
  /** Raw body; caller strips with parseEmailBody. */
  body: string;
  attachments: MailAttachment[];
  /** Built by buildMessageUrl(id). */
  messageUrl: string;
}

/** A message currently selected in Apple Mail (any mailbox). */
export interface SelectedMessage {
  id: string;
  accountName: string;
  /** "out" if sentMailboxes[accountName] is set and mailbox.name equals it (exact),
   *  else (no entry) "out" if mailbox.name lowercased contains "sent"; else "in". */
  direction: "in" | "out";
  subject: string;
  /** Display name of the correspondent (sender if "in", first To: recipient if "out"). */
  partyName: string;
  /** Email address of the correspondent (sender if "in", first To: address if "out"). */
  partyAddress: string;
  /** ISO 8601 string. */
  dateSent: string;
}

// New methods on the MailBridge interface:
export interface MailBridge {
  // …existing methods…

  /**
   * Returns all messages in the account's configured Sent mailbox (sentMailboxes[accountName]
   * ?? defaultSentMailbox) whose sender is the account owner and whose recipient list
   * contains correspondentAddress. The TS caller filters by threadKey.
   * JXA does NOT normalize subjects — returns raw subjects for TS filtering.
   * Messages are always direction: "out".
   * Throws on JXA failure; caller degrades to inbound-only filing.
   */
  listSentForThread(
    accountName: string,
    correspondentAddress: string,
    sentMailboxName: string,
  ): Promise<ThreadMessage[]>;

  /**
   * Returns the message(s) currently selected in Apple Mail across any open mailbox.
   * Returns [] when nothing is selected.
   */
  getSelection(): Promise<SelectedMessage[]>;
}

// Updated createOsascriptBridge signature — gains sentMailboxes:
export function createOsascriptBridge(
  archiveMailboxes: Record<string, string>,
  defaultArchiveMailbox: string,
  sentMailboxes: Record<string, string>,
  defaultSentMailbox: string,
): MailBridge;
```

```ts
// src/features/email-filing/email-format-engine.ts — additions (pure)

/**
 * Parses message:// links from a Vorgang's content and returns the set of
 * already-filed Message-IDs. Links have the form:
 *   message://%3C<encoded-id>%3E
 * where angle brackets are percent-encoded by buildMessageUrl. The id is
 * extracted by stripping the leading "message://%3C" and trailing "%3E" and
 * then calling decodeURIComponent on the remainder.
 */
export function extractFiledMessageIds(vorgangContent: string): Set<string>;

/**
 * Renders a chronological multi-message conversation as one Vorgang section.
 *
 * sectionName = "E-Mail-Thread: <sanitizedStrippedSubject>"
 *
 * bodyLines (per message, blank-line separated between messages):
 *   "**<DD.MM.YYYY> — <partyName> (eingegangen|gesendet):**"
 *   "- siehe [E-Mail von <partyName>: <strippedSubject>](<messageUrl>)"
 *   <body lines, if any>
 *   "Anhänge: <name1>, <name2>"  (omitted when no attachments)
 *
 * Messages are sorted by dateSent ascending before rendering (caller may pre-sort;
 * this function re-sorts to guarantee order).
 * The date in the sub-header uses formatDate(date, locale) (DD.MM.YYYY for "de").
 * partyName and subject are sanitized via sanitizeSenderSubject before embedding.
 */
export function formatThreadSection(
  messages: Array<{
    direction: "in" | "out";
    partyName: string;
    dateSent: string;   // ISO 8601
    body: string;       // raw; caller strips via parseEmailBody upstream
    attachments: MailAttachment[];
    messageUrl: string;
  }>,
  subject: string,
  locale: DateLocale,
): { sectionName: string; bodyLines: string[] };
```

```ts
// src/features/email-filing/email-routing.ts — new pure module

import type { FiledRecord } from "../besprechung/besprechung-suggest-engine";

/** 24 hours in milliseconds. */
export const ROUTING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface MinedFiling {
  /** Correspondent identifier extracted from the "E-Mail von <sender>" heading. */
  correspondent: string;
  /** Stripped subject extracted from the section heading, if present. */
  subject: string;
  /** Basename of the Vorgang note this heading was found in. */
  target: string;
}

/**
 * Parses one section note's content for prior email filings.
 * Looks for h5 headings matching the pattern:
 *   ##### E-Mail von <sender>: <subject>, <DD.MM.YYYY>
 * or
 *   ##### E-Mail-Thread: <subject>, <DD.MM.YYYY>
 * Returns one MinedFiling per match with target = basename.
 * Returns [] when no matching headings are found.
 */
export function mineVorgangFilings(content: string, basename: string): MinedFiling[];

/**
 * Converts MinedFiling records to FiledRecord[] for use with suggestFilingTargets.
 * correspondent → rawTitle, target → target, filedAt → null.
 */
export function minedFilingsToFiledRecords(filings: MinedFiling[]): FiledRecord[];

/**
 * Returns true when the cache should be rebuilt.
 * @param builtAt  ISO 8601 string from routingCache.builtAt, or undefined when no cache.
 * @param now      Current time in epoch ms (injectable for testing).
 */
export function isCacheStale(builtAt: string | undefined, now: number): boolean;
```

```ts
// src/features/email-filing/email-filing-settings.ts — additions

import type { FiledRecord } from "../besprechung/besprechung-suggest-engine";

export interface RoutingCache {
  /** ISO 8601 timestamp of when this cache was built. */
  builtAt: string;
  /** Mined FiledRecord corpus for cross-session suggestions. */
  records: FiledRecord[];
}

export interface EmailFilingSettings {
  order: "oldest" | "newest";
  defaultArchiveMailbox: string;
  archiveMailboxes: Record<string, string>;
  walkAccounts: Record<string, boolean>;
  /**
   * Maps Mail account name → Sent mailbox name for that account.
   * Default for unmapped accounts: defaultSentMailbox.
   * Populated by the "Detect accounts" button alongside archiveMailboxes.
   */
  sentMailboxes: Record<string, string>;
  /** Default Sent mailbox name for accounts not in sentMailboxes. */
  defaultSentMailbox: string;
  /**
   * Cached cross-session routing corpus (mined from Vorgänge).
   * Not vault content. Managed internally; not user-editable.
   */
  routingCache?: RoutingCache;
}

export const DEFAULT_EMAIL_FILING_SETTINGS: EmailFilingSettings = {
  order: "oldest",
  defaultArchiveMailbox: "Archive",
  archiveMailboxes: {},
  walkAccounts: {},
  sentMailboxes: {},
  defaultSentMailbox: "Sent",
};
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `emailFiling.sentMailboxes` | `Record<string, string>` | `{}` | Per-account Sent mailbox name overrides. Keys are Mail account display names. |
| `emailFiling.defaultSentMailbox` | `string` | `"Sent"` | Fallback Sent mailbox for unmapped accounts. |
| `emailFiling.routingCache` | `RoutingCache \| undefined` | `undefined` | Internal cache; not user-editable. Managed by the feature. |

The "Detect accounts" button in settings populates `sentMailboxes` (with `defaultSentMailbox` as the default value) alongside `archiveMailboxes`, for any account not already present. The settings UI renders one additional text field per account for the Sent mailbox name, immediately below the archive mailbox field for that account.

`mergeSettings` in `src/types.ts` must deep-merge the new fields:
```ts
emailFiling: {
  ...DEFAULT_EMAIL_FILING_SETTINGS,
  ...(saved.emailFiling ?? {}),
  archiveMailboxes: { ...DEFAULT_EMAIL_FILING_SETTINGS.archiveMailboxes, ...(saved.emailFiling?.archiveMailboxes ?? {}) },
  sentMailboxes:    { ...DEFAULT_EMAIL_FILING_SETTINGS.sentMailboxes,    ...(saved.emailFiling?.sentMailboxes ?? {}) },
  walkAccounts:     { ...DEFAULT_EMAIL_FILING_SETTINGS.walkAccounts,     ...(saved.emailFiling?.walkAccounts ?? {}) },
}
```

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---------|---------|-----------|--------------|
| Sent search fails | JXA error reading Sent mailbox | File the inbound message alone (no thread enrichment); record threadKey in skippedThreads normally | Notice: "Gesendete Nachrichten konnten nicht geladen werden – nur die eingegangene E-Mail abgelegt." |
| No selection | "File selected" with nothing selected | Show Notice, return | Notice: "Keine Nachricht in Mail ausgewählt." |
| Vorgang read fails for dedup | `vault.read` throws on target | Proceed without dedup (may duplicate); log error type only | Notice: "Konnte „<basename>" nicht auf Duplikate prüfen." |
| Corpus mine fails | `mineVorgangFilings` throws for a note | Skip that note; continue mining remaining notes; retain previous cache if full mine fails | `console.warn` (PII-safe, error type only); no Notice |
| listSentForThread returns [] | No Sent replies in thread | File inbound alone; no Notice (normal case when no reply yet sent) | — |

## Implementation Phases

## Phase 1 — Conversation assembly & dedup

Add `senderAddress: string` to `RawMailMessageMeta` (updated in `mail-bridge.ts` and the `LIST_INBOX_JS` JXA script — parse the sender address from the `sender` field in `parseSenderName`, or expose it as a separate JXA property).

Add `listSentForThread` to the `MailBridge` interface and implement it in `createOsascriptBridge`. The `LIST_SENT_FOR_THREAD_JS` JXA script searches `sentMailboxes[accountName] ?? defaultSentMailbox` for messages where any recipient address matches `correspondentAddress`. It returns all such messages (raw subject, not normalized); the TS wrapper filters by `threadKey`. All three values (`accountName`, `correspondentAddress`, `sentMailboxName`) are passed as argv — never interpolated.

Add `extractFiledMessageIds` and `formatThreadSection` to `email-format-engine.ts`.

In `email-filing-feature.ts`, update `fileEmailIntoVorgang` to:
1. Read target Vorgang content (`vault.read`) before the archive step.
2. Call `listSentForThread(meta.accountName, meta.senderAddress, sentMailboxFor(meta.accountName))`.
3. Filter Sent replies by `threadKey(meta.subject) === threadKey(reply.subject)`.
4. Call `extractFiledMessageIds` on the already-read content.
5. Assemble `[inboundAsThreadMessage, ...filteredReplies]`, filter out already-filed ids, sort by dateSent.
6. Call `formatThreadSection` to get `{ sectionName, bodyLines }`.
7. Call `addVorgangSection(content, sectionName, locale, latestDate, bodyLines)` where `latestDate` is the latest `dateSent` in the assembled messages.
8. After a successful `vault.modify`, add `threadKey(meta.subject)` to `skippedThreads`.

When `listSentForThread` rejects: log error type, show Notice, proceed with assembly of `[inboundAsThreadMessage]` only (still dedups, still records threadKey).

`inboundAsThreadMessage` shape: `{ id: meta.id, direction: "in", partyName: meta.senderName, dateSent: meta.dateSent, body: <parsed body>, attachments: <filtered attachments>, messageUrl: buildMessageUrl(meta.id) }`.

Phase complete when: unit tests for `extractFiledMessageIds` and `formatThreadSection` pass; an acceptance test (fake bridge) verifies a filed thread contains both directions, excludes already-linked ids, and adds the threadKey to `skippedThreads`; `npm run test` + `npm run build` green.

### Test Scenarios

- GIVEN content `"- siehe [E-Mail von Alice: Angebot](message://%3Cm1%3E)"`, WHEN `extractFiledMessageIds(content)`, THEN the returned Set contains `"m1"` and has size 1.
- GIVEN content with no `message://` links, WHEN `extractFiledMessageIds(content)`, THEN returns an empty Set.
- GIVEN messages `[{id:"m2", direction:"in", dateSent:"2026-06-01T09:00Z", partyName:"Alice", body:"Hallo", attachments:[], messageUrl:"message://%3Cm2%3E"}, {id:"m3", direction:"out", dateSent:"2026-06-01T10:00Z", partyName:"Lukas", body:"Danke", attachments:[], messageUrl:"message://%3Cm3%3E"}]`, subject `"Angebot"`, locale `"de"`, WHEN `formatThreadSection(messages, "Angebot", "de")`, THEN `sectionName === "E-Mail-Thread: Angebot"`, `bodyLines` contains `"**01.06.2026 — Alice (eingegangen):**"` before `"**01.06.2026 — Lukas (gesendet):**"`, and both `message://%3Cm2%3E` and `message://%3Cm3%3E` appear in `bodyLines` in that order.
- GIVEN assembled messages contain id `"m1"` and the target Vorgang already links `message://%3Cm1%3E`, WHEN dedup is applied upstream by the caller, THEN `formatThreadSection` is called without `m1` (it is filtered before `formatThreadSection`).
- GIVEN a fake bridge where `listSentForThread` returns one Sent reply with matching threadKey, WHEN a walk files an inbound message, THEN the written Vorgang content includes both the inbound and Sent message blocks in date order.
- GIVEN a fake bridge where `listSentForThread` rejects, WHEN a walk files an inbound message, THEN only the inbound block is written and a Notice containing "Gesendete Nachrichten" is shown.
- GIVEN a fake bridge where `listSentForThread` returns a Sent reply whose subject threadKey does NOT match, WHEN filing, THEN that Sent message is excluded from the assembled thread.
- GIVEN a thread is filed, WHEN the walk reaches a second inbox message with the same `threadKey`, THEN it is auto-skipped and `archive` is not called for it.

## Phase 2 — Single-shot "File selected Mail message"

Add `getSelection` to the `MailBridge` interface and implement it in `createOsascriptBridge`. The `GET_SELECTION_JS` JXA script reads `selection of Mail` (which spans any open mailbox) and returns for each selected message: `id`, `accountName`, `subject`, `dateSent`, `partyName`, `partyAddress`, and the raw `mailboxName`. The TS wrapper sets `direction`: when `sentMailboxes[accountName]` exists, `"out"` iff `mailboxName` equals it exactly; when it does not exist, `"out"` iff `mailboxName.toLowerCase().includes("sent")` (case-insensitive substring fallback); else `"in"`. For `"out"` messages, `partyName` is the first To: recipient display name and `partyAddress` is the first To: recipient address; for `"in"` messages, `partyName` is the sender display name and `partyAddress` is the sender address.

Add command `"E-Mail: File selected Mail message"` to `EmailFilingFeature.onload`. The command:
1. Calls `bridge.getSelection()`. If `[]`, shows Notice "Keine Nachricht in Mail ausgewählt." and returns.
2. Sorts selected messages by `dateSent` ascending.
3. For each selected message in order: assembles the thread (calls `listSentForThread` with correspondent's address and the sentMailbox for that account; filters by threadKey; if selected message is `"in"`, includes it as the inbound; if `"out"`, skips adding it separately since `listSentForThread` already returns Sent messages); deduplicates; opens `SectionNoteSuggestModal` with **Pick** and **Don't-file** only (no Skip, no Stop+open — degenerate for single-shot); on Pick opens `EmailPreviewModal` → on confirm calls `vault.modify` only (NO `archive`, NO `isInInbox`). On `onCancel` (ESC), halts the loop and returns.
4. "Don't-file" for the single-shot command does nothing (no archive, no filing) and advances.

The single-shot command has its own walk guard: if `walkInProgress` is true, shows Notice "Walk läuft bereits." and returns. The same `walkInProgress` boolean covers both commands.

Phase complete when: acceptance test (fake bridge) verifies the command files the selection's thread without calling `archive` or `isInInbox`, the empty-selection path shows the Notice, the dedup path prevents duplication, and an inbox-mailbox selection is not archived; `npm run test` + `npm run build` green.

### Test Scenarios

- GIVEN a fake bridge where `getSelection` returns one outbound message to Bob (no other messages), WHEN the command runs and a Vorgang is picked, THEN the thread is filed via `vault.modify` and `archive` is never called.
- GIVEN a fake bridge where `getSelection` returns `[]`, WHEN the command runs, THEN a Notice containing "Keine Nachricht" is shown and `vault.modify` is not called.
- GIVEN a fake bridge where `getSelection` returns a message whose id already appears as `message://%3C<id>%3E` in the target Vorgang, WHEN filed, THEN the id does not appear twice in the Vorgang content after filing.
- GIVEN a fake bridge where `getSelection` returns an inbound inbox message, WHEN the command files it, THEN `archive` is never called (capture-only, regardless of mailbox).
- GIVEN a fake bridge where `getSelection` returns two messages `[older, newer]` (dateSent ascending), WHEN the command runs and the user picks a Vorgang for the first, THEN the second message's picker opens after the first confirm.
- GIVEN a fake bridge where `getSelection` returns two messages and the user cancels (ESC) the picker for the first, THEN the loop halts and the second message's picker does not open.
- **MANUAL (no CI gate):** GIVEN a real Apple Mail message selected in a non-inbox mailbox WHEN `getSelection` runs via osascript THEN correct `id`, `subject`, `direction`, and `partyAddress` are returned.

## Phase 3 — Cross-session routing (mine Vorgänge + plugin-data cache)

Create `src/features/email-filing/email-routing.ts` with `mineVorgangFilings`, `minedFilingsToFiledRecords`, `isCacheStale`, and the constant `ROUTING_CACHE_TTL_MS = 24 * 60 * 60 * 1000`.

`mineVorgangFilings(content, basename)` matches h5 headings of the forms generated by Phase 1's `formatThreadSection` and the base feature's `formatEmailSection`:
- `##### E-Mail von <sender>: <subject>, <DD.MM.YYYY>` → `correspondent = <sender>`, `subject = <subject>`
- `##### E-Mail-Thread: <subject>, <DD.MM.YYYY>` → `correspondent = ""`, `subject = <subject>`

`isCacheStale(builtAt, now)` returns `true` when `builtAt` is `undefined` or when `now - new Date(builtAt).getTime() > ROUTING_CACHE_TTL_MS`.

In `email-filing-feature.ts`, add a private `buildRoutingCorpus(now: number): Promise<FiledRecord[]>` method:
1. Load current settings (`this.plugin.loadData()`).
2. Call `isCacheStale(settings.emailFiling.routingCache?.builtAt, now)`.
3. If stale: scan all vault `TFile`s with `frontmatterTagsInclude(tags, SECTION_NOTE_TAGS)`; for each, call `mineVorgangFilings(await vault.read(file), file.basename)`; collect all `MinedFiling[]`; convert via `minedFilingsToFiledRecords`; write `routingCache = { builtAt: new Date(now).toISOString(), records }` to plugin data via `saveData`; return records. On any read error for a file, skip that file (`console.warn`, PII-safe). If the full mine fails entirely, retain the previous cache (or return `[]` if no prior cache exists).
4. If fresh: return `routingCache.records`.

Call `buildRoutingCorpus(Date.now())` at the start of `beginWalk()` and at the start of the single-shot command, before opening any picker. Combine the returned corpus with `this.walkFiledRecords` and pass to `suggestFilingTargets`.

After each successful filing (after `vault.modify` succeeds), rebuild the routing corpus immediately: call `buildRoutingCorpus(Date.now())` again (which will be stale since we just wrote a new record — or update the in-memory corpus directly by re-running the mine). Simpler: after a successful filing, invalidate the cache by setting `routingCache.builtAt` to `new Date(0).toISOString()` in plugin data; the next call to `buildRoutingCorpus` will rescan. This avoids a second vault scan in the same walk.

The `isCacheStale` and `mineVorgangFilings` functions accept `now: number` (epoch ms) as an explicit parameter so they are testable without mocking `Date`.

**Format contract (pinned):** `mineVorgangFilings` must match headings produced by `formatEmailSection` (`E-Mail von <sender>: <subject>`) and `formatThreadSection` (`E-Mail-Thread: <subject>`). If either format changes in Phase 1, `mineVorgangFilings` must be updated in the same commit.

Phase complete when: unit tests for `mineVorgangFilings` and `isCacheStale` pass; an acceptance test verifies suggestions reflect a correspondent filed into a Vorgang in a prior session (via the mined corpus); a test verifies `isCacheStale` returns `true` when `builtAt` is >24h ago and `false` when fresh; existing suggestion tests still pass; `npm run test` + `npm run build` green.

### Test Scenarios

- GIVEN content `"##### E-Mail von Alice: Angebot, 01.06.2026\n"`, WHEN `mineVorgangFilings(content, "Müller GmbH")`, THEN returns `[{ correspondent: "Alice", subject: "Angebot", target: "Müller GmbH" }]`.
- GIVEN content `"##### E-Mail-Thread: Budget-Planung, 15.06.2026\n"`, WHEN `mineVorgangFilings(content, "Acme AG")`, THEN returns `[{ correspondent: "", subject: "Budget-Planung", target: "Acme AG" }]`.
- GIVEN content with no `E-Mail von` or `E-Mail-Thread` headings, WHEN `mineVorgangFilings(content, "Foo")`, THEN returns `[]`.
- GIVEN `isCacheStale(undefined, Date.now())`, THEN returns `true`.
- GIVEN `isCacheStale(new Date(Date.now() - ROUTING_CACHE_TTL_MS - 1).toISOString(), Date.now())`, THEN returns `true`.
- GIVEN `isCacheStale(new Date(Date.now() - 3600_000).toISOString(), Date.now())` (1 hour ago), THEN returns `false`.
- GIVEN a mined corpus `[{ correspondent: "alice@example.com", subject: "Angebot", target: "Müller GmbH" }]` converted to `FiledRecord[]`, WHEN `suggestFilingTargets` is called for a message from alice@example.com, THEN "Müller GmbH" appears in the ranked candidates.
- GIVEN `routingCache.builtAt` is >24h old, WHEN walk starts, THEN `buildRoutingCorpus` rescans the vault and updates `routingCache` in plugin data before the first picker opens.
- GIVEN all pre-existing email-filing and besprechung suggestion tests, WHEN `npm run test` is run after Phase 3, THEN all pass.

## Decision Log

- **Vorgänge are the record (no new vault storage for dedup/routing).** Filed `message://` ids and `E-Mail von` headings already encode what's filed and to whom; dedup reads the target Vorgang, routing mines section-note contents. Chosen over a vault ledger/per-email notes ("doubles", rejected).
- **Persistence, where needed, lives in `data.json` (plugin data), not the vault.** A hidden routing cache is not a vault note and not a "double"; it respects "no additional storage in the vault."
- **Thread identity = correspondent address + `threadKey`.** `References`/`In-Reply-To` headers are not exposed to Mail scripting; subject+correspondent is the tightest available signal. Subject-only over-groups on generic subjects. The preview is the backstop.
- **Assemble inbound + Sent only; do not reconstruct from Archive.** Reaching into Archive for older received messages risks re-including content filed in a prior session. Dedup against the target plus pulling Sent covers the live conversation; Archive reconstruction rejected.
- **Sent messages are never archived/moved.** Archiving is an inbox-zero action on received mail; Sent stays in Sent. The single-shot command archives nothing (capture-only, regardless of mailbox).
- **"Reply, then file" is the intended habit.** A Sent reply is pulled only if it exists when the inbound message is filed; filing after replying captures it. Documented, not enforced.
- **Routing cache TTL is 24 hours, hardcoded.** `ROUTING_CACHE_TTL_MS = 24 * 60 * 60 * 1000` in `email-routing.ts`; not user-configurable. Cache is also invalidated (builtAt set to epoch 0) after each successful filing so the next call to `buildRoutingCorpus` rescans immediately. Chosen as a concrete resolution over vague "e.g. a day" language.
- **Single-shot "File selected" is strictly capture-only.** `archive` is never called by the single-shot command, regardless of which mailbox the selected message came from. The walk is the archiving path. Predictable and consistent.
- **JXA returns all Sent to correspondent; TS filters by threadKey.** `listSentForThread` JXA script does not normalize subjects; it returns all Sent messages to the named address. The TS wrapper filters by `threadKey(reply.subject) === threadKey(inbound.subject)` using the existing `stripSubjectPrefixes` function. Keeps JXA simple and the normalization logic testable.
- **`sentMailboxes` mirrors `archiveMailboxes` pattern.** Per-account Sent mailbox name, populated by the "Detect accounts" button, with a `defaultSentMailbox` fallback. Necessary because Sent mailbox names vary by account type and locale.
- **First To: recipient is the correspondent for outbound messages.** When a selected Sent message has multiple recipients, `partyAddress` is the first To: address and `partyName` is the first To: display name. Deterministic; handles the common case.
- **mineVorgangFilings scope = section-note tags.** Scans all TFiles with frontmatter tags `Vorgang|Person|Bestellung|Bewerbung` — the same set as `SectionNoteSuggestModal` candidates. Avoids scanning the entire vault.
- **`isCacheStale` accepts `now: number` parameter.** Makes TTL logic testable as a pure function without mocking `Date.now()`.
- **Format contract pinned between Phase 1 and Phase 3.** `mineVorgangFilings` targets exactly the heading formats produced by `formatEmailSection` and `formatThreadSection`. Changes to either format must update `mineVorgangFilings` in the same commit.
- **`getSelection` direction: exact match when configured, `"sent"` substring fallback otherwise.** When the account has a `sentMailboxes[accountName]` entry, `direction` is `"out"` iff `mailboxName` equals it exactly. When the account has no entry (e.g. "Detect accounts" not yet run), fall back to a case-insensitive substring match: `direction = "out"` iff `mailboxName.toLowerCase().includes("sent")`. This handles localized/Gmail Sent names before detection without exposing full mailbox paths from JXA. (Resolves the prior open decision.)

## Open Decisions

None — all design choices are resolved; see the Decision Log.

## Out of Scope

- A full **Sent-mailbox walk** (triaging all sent mail). The single-shot command covers initiated threads on demand.
- **`References`-based** threading (not scriptable in Mail JXA).
- **Cross-Vorgang dedup** (a message may legitimately belong to two Vorgänge); dedup is per-target.
- Attachment **content** extraction; HTML→markdown (deferred to v2).
- Per-email notes / visible vault ledger.
- Exposing `routingCache` in the settings UI (internal cache only).
