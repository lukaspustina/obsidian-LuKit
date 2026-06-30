# SDD: Email Filing (Apple Mail → Vorgang)

Status: Ready for Implementation
Original: specs/sdd/email-filing.md
Refined: 2026-06-30

## Overview

A new LuKit feature that walks the Apple Mail inbox one message at a time and files each into a section note (Vorgang/Person/Bestellung/Bewerbung), mirroring the Besprechung "File pending notes" flow. For each message the user picks a target, edits the extracted body in a preview modal, and the message is archived in Mail and embedded as an h5 section in the target note. The inbox is the pending queue; archiving drains it; no email state is stored in the vault.

## Context & Constraints

- **Stack:** TypeScript strict (no `any`), Obsidian desktop plugin, Vitest, esbuild. Node `child_process` available (desktop-only — this feature is macOS-only, consistent with LuKit's CLI/LaunchBar).
- **Conventions:** Feature module pattern — pure `*-engine.ts` (no Obsidian/Mail imports, fully unit-testable) + `*-feature.ts` (Obsidian wiring) + `*-settings.ts`. Explicit return types, named exports, early returns. Section names/dates use the global `dateLocale`.
- **Reuse:** `SectionNoteSuggestModal` (shared picker), `addVorgangSection` (vorgang-engine), `suggestFilingTargets` (besprechung-suggest-engine), `text-input-modal`/`text-date-modal` (shared modals). The walk structure mirrors BesprechungFeature's "File pending notes" sequential `next()` callback chain.
- **Bridge fragility:** Apple Mail is reachable only via `osascript`; the bridge is the only impure, least-testable surface and concentrates the highest risk (per-account archive, Gmail, body quirks). It is injected so the feature is testable with a fake.

## Architecture

```
"File inbox emails" command (email-filing-feature.ts)
   │
   ├─ MailBridge.listInbox()  ──► [osascript JXA]  metadata only
   │      │
   │      └─ [] → Notice "Inbox is empty"; return
   │
   └─ for each message (next() chain):
        ├─ MailBridge.fetchBody(account,id) ──► [osascript JXA]  lazy
        │      └─ not found → Notice + Skip + advance
        ├─ parseEmailBody(raw)        (email-quote-engine.ts, pure)
        ├─ filterAttachments(all)     (email-format-engine.ts, pure)
        ├─ suggestFilingTargets(...)  (besprechung-suggest-engine.ts, reused)
        ├─ SectionNoteSuggestModal    (shared, label overrides)
        │     Pick → EmailPreviewModal (editable body, read-only header info)
        │              └─ confirm:
        │                   ├─ MailBridge.archive(account,id) ──► [osascript JXA]
        │                   ├─ MailBridge.isInInbox(account,id) → verify gone
        │                   ├─ formatEmailSection(meta, editedBody, attachments, locale) (pure)
        │                   └─ addVorgangSection(content, name, locale, date, bodyLines) → vault.modify
        │     Don't-file → archive only
        │     Skip → advance · Stop+open → open message:// + halt
```

## Requirements

1. The system shall register an Obsidian command "File inbox emails" that walks the Apple Mail inbox across all accounts.
2. The system shall enumerate inbox messages as lightweight metadata (id, accountName, senderName, subject, dateSent) up front via `listInbox()`, and fetch each message's body lazily via `fetchBody()` when the walk reaches it.
3. The system shall present messages in a configurable order: `"oldest"` first by sent date (default) or `"newest"`.
4. The system shall, for each message, open `SectionNoteSuggestModal` with Pick, Skip, Don't-file, and Stop+open entries, and name-match suggestions (ranked by `suggestFilingTargets` with empty corpus and title `<subject> <sender>`) pinned on top.
5. On Pick, the system shall open `EmailPreviewModal` pre-filled with the extracted email body (editable textarea) and read-only header fields (sender, subject, date, target note name); the user confirms or edits before filing.
6. On confirm in `EmailPreviewModal`, the system shall: (a) call `MailBridge.archive(accountName, messageId)`, (b) call `MailBridge.isInInbox(accountName, messageId)` and treat `true` as failure, then (c) call `vault.modify` to insert the h5 section — in that order. If any step fails the system shall show an error Notice and not execute subsequent steps.
7. On Don't-file, the system shall archive the message without modifying any note.
8. On Skip, the system shall leave the message in the inbox and advance to the next.
9. On Stop+open (and on ESC), the system shall halt the walk; Stop+open shall additionally open the current message in Apple Mail by invoking `open("message://<encoded-id>")`.
10. The system shall extract the new content of a message body by removing quoted history (`>`-prefixed lines, Apple Mail `Am … schrieb …:` attribution lines, German Outlook `Von:/Gesendet:/An:/Betreff:` header blocks, `-----Ursprüngliche Nachricht-----` separators) and the signature (`-- ` delimiter / known disclaimer markers). When a line could be either content or a quote marker, keep it (under-trim rule). Text after a quoted attribution line that does not start with `>` is retained in `body`.
11. The system shall format each filed section as a plain h5 heading with a TOC bullet, a `- siehe [E-Mail von <sender>](message://<encoded-id>)` link line, the (edited) body, and — when present — a `Anhänge: <names>` line.
12. The system shall list only real attachments via `filterAttachments`, filtering out all `image/*` attachments with `size <= 51200` bytes (50 × 1024), and attachments with `size === -1` (unknown size reported by JXA) are treated as size 0 and filtered if their mimeType is `image/*`. The system shall never copy attachment files into the vault.
13. The system shall sanitize `senderName` and `subject` before building the heading and link, removing or replacing `,` `]]` `|` `#` characters so they do not collide with the vorgang `name, DD.MM.YYYY` heading convention or break markdown links.
14. The system shall strip recognized prefixes (`AW:`, `Re:`, `Fwd:`, `FWD:`, `WG:`, case-insensitive, possibly repeated) from subject before ranking and building the section name. If stripping leaves an empty or whitespace-only subject, the system shall fall back to the original subject.
15. The system shall rank filing suggestions by name-match only, calling `suggestFilingTargets` with an empty history corpus and title composed of the stripped subject and sender name.
16. The system shall store no email state in the vault (no per-email notes, no Message-ID ledger).
17. The system shall degrade an empty extracted body to just the link line (forward-only / attachment-only mail).
18. The system shall expose the mail bridge behind an injectable `MailBridge` interface so the feature is acceptance-testable without Apple Mail.
19. The system shall show a Notice "Inbox ist leer" and return immediately when `listInbox()` returns an empty array.
20. The system shall guard against concurrent walks: if "File inbox emails" is invoked while a walk is in progress, it shall show a Notice "Walk läuft bereits" and return immediately.
21. The system shall handle a missing sender display name by falling back to the raw email address (bridge-side: JXA must return the sender address when display name is absent).
22. All JXA bridge calls (`listInbox`, `fetchBody`, `archive`, `isInInbox`) shall search and operate within the named account only, so that duplicate Message-IDs across accounts do not cause cross-account interference.
23. The settings UI shall provide a "Detect accounts" button that calls `MailBridge.listAccounts()` and, for each returned account not already present in `archiveMailboxes`, adds a key with its value defaulted to `defaultArchiveMailbox`; existing entries are left unchanged.

## File & Module Structure

New files:
- `src/features/email-filing/email-quote-engine.ts` — pure: `parseEmailBody` (quote + signature stripping).
- `src/features/email-filing/email-format-engine.ts` — pure: `formatEmailSection`, `filterAttachments`, `sanitizeSenderSubject`, `stripSubjectPrefixes`.
- `src/features/email-filing/mail-bridge.ts` — impure: `MailBridge` interface + `createOsascriptBridge`; JXA scripts as string constants.
- `src/features/email-filing/email-filing-feature.ts` — `LuKitFeature`: command, concurrent-walk guard, walk loop, picker wiring, preview-on-Pick, archive-first→verify→modify contract.
- `src/features/email-filing/email-filing-settings.ts` — `EmailFilingSettings`, `DEFAULT_EMAIL_FILING_SETTINGS`.
- `src/features/email-filing/email-preview-modal.ts` — editable body preview modal (textarea + confirm/cancel); email-filing-specific, not shared.
- `tests/unit/email-quote-engine.test.ts` — fixtures for Apple Mail, German Outlook, nested quotes, signature/disclaimer variants, under-trim edge cases.
- `tests/unit/email-format-engine.test.ts` — fixtures for sanitization, prefix stripping, empty body, attachment filtering.
- `tests/acceptance/email-filing-feature.test.ts` — walk flow with fake `MailBridge` + mocked vault covering all pick actions and error paths.

Modified files:
- `src/features/vorgang/vorgang-engine.ts` — `addVorgangSection` gains optional `bodyLines?: string[]` passed through to `insertVorgangContent`; default `[]`.
- `src/shared/modals/section-note-suggest.ts` — `SectionNoteSuggestOptions` gains optional `skipLabel?: string`, `dropLabel?: string`, `openLabel?: string`; each defaults to the current hardcoded string.
- `src/features/besprechung/besprechung-suggest-engine.ts` — `SuggestOptions` gains optional `nameMatchOnly?: boolean`; when `true`, the function uses only name-match scoring (ignores corpus history). Defaults preserve current behavior.
- `src/types.ts` — add `emailFiling: EmailFilingSettings` to `LuKitSettings`, `DEFAULT_SETTINGS`, and `mergeSettings` (missing keys fall back to `DEFAULT_EMAIL_FILING_SETTINGS`).
- `src/main.ts` — import and register `EmailFilingFeature`.
- `README.md`, `CLAUDE.md`, `TODO.md` — document the feature.

## Data Models

```ts
// src/features/email-filing/mail-bridge.ts

export interface MailAttachment {
  name: string;
  mimeType: string;
  /** Bytes. -1 when JXA reports unknown size (treat as 0 for filtering purposes). */
  size: number;
}

export interface RawMailMessageMeta {
  /** Message-ID without angle brackets. Unique within an account. */
  id: string;
  /** Owning Mail account name — used to scope all bridge calls. */
  accountName: string;
  /** Display name; falls back to sender address when display name is absent. */
  senderName: string;
  subject: string;
  /** ISO 8601 string, e.g. "2026-06-30T10:00:00Z". */
  dateSent: string;
}

export interface RawMailBody {
  body: string;
  attachments: MailAttachment[];
}

export interface MailBridge {
  /** Returns all inbox messages across all accounts, sorted by dateSent ascending. */
  listInbox(): Promise<RawMailMessageMeta[]>;
  /** Returns the display names of all configured Mail accounts. Used by the settings "Detect accounts" button. */
  listAccounts(): Promise<string[]>;
  /** Fetches body and attachments for a message in the named account. Throws if not found. */
  fetchBody(accountName: string, messageId: string): Promise<RawMailBody>;
  /** Moves the message to the account's configured archive mailbox. Throws on failure. */
  archive(accountName: string, messageId: string): Promise<void>;
  /** Returns true if the message is still present in the named account's inbox. */
  isInInbox(accountName: string, messageId: string): Promise<boolean>;
}

/**
 * Creates a real MailBridge backed by osascript JXA.
 * Recreate this instance if settings change (archiveMailboxes map is captured at construction time).
 */
export function createOsascriptBridge(
  archiveMailboxes: Record<string, string>,
  defaultArchiveMailbox: string,
): MailBridge;

// src/features/email-filing/email-quote-engine.ts

export interface ParsedEmail {
  /** New text only — quoted history and signature removed. Empty string when nothing remains. */
  body: string;
  /** Removed quoted block (diagnostic; not used by the feature, available for future use). */
  quoted: string;
  /** Removed signature block (diagnostic; not used by the feature, available for future use). */
  signature: string;
}

export function parseEmailBody(raw: string): ParsedEmail;

// src/features/email-filing/email-format-engine.ts

export interface EmailMeta {
  senderName: string;
  subject: string;
  dateSent: Date;
  /** Full percent-encoded URL, e.g. "message://3D%40example.com". */
  messageUrl: string;
}

/**
 * Returns the section name (without date suffix — caller passes date separately to addVorgangSection)
 * and the body lines to insert under the h5 heading.
 * Format: sectionName = "E-Mail von <sanitizedSender>: <sanitizedStrippedSubject>"
 * bodyLines: [link line, ...body lines (if any), "Anhänge: ..." (if any)]
 */
export function formatEmailSection(
  meta: EmailMeta,
  body: string,
  attachments: MailAttachment[],
  locale: DateLocale,
): { sectionName: string; bodyLines: string[] };

/**
 * Filters out inline images: all image/* attachments with size <= 51200 bytes,
 * and image/* attachments with size === -1 (unknown). Returns a new array; does not mutate input.
 */
export function filterAttachments(all: MailAttachment[]): MailAttachment[];

// src/features/email-filing/email-filing-settings.ts

export interface EmailFilingSettings {
  order: "oldest" | "newest";
  /** Archive mailbox name used when an account has no entry in archiveMailboxes. Default: "Archive". */
  defaultArchiveMailbox: string;
  /** Maps Mail account name → archive mailbox name. E.g. { "Gmail": "[Gmail]/All Mail" }. */
  archiveMailboxes: Record<string, string>;
}

export const DEFAULT_EMAIL_FILING_SETTINGS: EmailFilingSettings = {
  order: "oldest",
  defaultArchiveMailbox: "Archive",
  archiveMailboxes: {},
};
```

## Configuration

Settings key: `emailFiling` (added to `LuKitSettings`).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `emailFiling.order` | `"oldest" \| "newest"` | `"oldest"` | Walk order by `dateSent`. |
| `emailFiling.defaultArchiveMailbox` | `string` | `"Archive"` | Fallback archive mailbox for unmapped accounts. |
| `emailFiling.archiveMailboxes` | `Record<string, string>` | `{}` | Per-account archive mailbox overrides. Keys are Mail account display names. |

Settings UI: a separate `defaultArchiveMailbox` text field above the per-account map; one labeled text field per entry in `archiveMailboxes`; a "+ Add account" button to add a key/value pair manually; and a "Detect accounts" button that calls `MailBridge.listAccounts()` and pre-fills the map with any missing account keys (value defaulted to `defaultArchiveMailbox`), leaving existing entries untouched. The settings render uses the feature's `MailBridge` instance; a failed `listAccounts()` call (e.g. TCC denial) shows a Notice and leaves the map unchanged.

`mergeSettings` behavior: keys missing from saved settings fall back to `DEFAULT_EMAIL_FILING_SETTINGS` values, consistent with existing features.

The `createOsascriptBridge` instance is constructed once at feature `onload` and reconstructed whenever settings are saved (to pick up changes to `archiveMailboxes`).

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---------|---------|-----------|--------------|
| Automation denied | macOS TCC blocks Obsidian→Mail (err -1743) | Bridge throws; abort walk | Notice: "Bitte erlaube Obsidian den Zugriff auf Mail in den Systemeinstellungen → Datenschutz → Automatisierung." |
| Archive throws | Bad mailbox name / IMAP error / not found | Do **not** call `isInInbox` or `vault.modify`; halt this message, advance walk | Notice with subject + `message://` link |
| Archive no-op | `isInInbox` returns `true` after archive | Do **not** call `vault.modify`; halt this message, advance walk | Notice: "Archivierung hat die Nachricht nicht aus dem Posteingang entfernt. Bitte Postfach-Konfiguration prüfen." |
| fetchBody not found | Message deleted between listInbox and its turn | Skip; advance | Notice: "Nachricht nicht mehr im Posteingang: <subject>" |
| vault.modify fails | Vault write error after successful archive | Report partial state; advance walk | Notice: "Archiviert, aber nicht in „<noteName>" abgelegt." |
| Empty body | Forward / attachment-only mail | File link line (+ attachments) only | Normal success Notice |
| Empty inbox | `listInbox()` returns `[]` | Return immediately | Notice: "Inbox ist leer." |
| Concurrent walk | Command invoked while walk in progress | Return immediately | Notice: "Walk läuft bereits." |

## Implementation Phases

## Phase 1 — Pure email engines

Implement `parseEmailBody` in `email-quote-engine.ts` and `filterAttachments`, `formatEmailSection`, `sanitizeSenderSubject`, `stripSubjectPrefixes` in `email-format-engine.ts`. No Obsidian, no Mail imports. Attachment filtering moves to `email-format-engine.ts` (not `email-quote-engine.ts`) to keep modules single-responsibility.

Heuristic priority order for `parseEmailBody` (documented as a code comment in the module):
1. Remove `-- ` signature delimiter and everything below it.
2. Remove known disclaimer markers and everything below them.
3. Remove `-----Ursprüngliche Nachricht-----` separators and everything below.
4. Remove German Outlook `Von:/Gesendet:/An:/Betreff:` header block and everything below.
5. Remove Apple Mail `Am … schrieb …:` attribution lines and all following `>`-prefixed lines.
6. Under-trim rule: when a line is ambiguous, keep it. Text after an attribution line that does not start with `>` is retained in `body`.

Phase complete when: all unit tests pass against the fixtures below; `npm run test` green.

### Test Scenarios

- GIVEN a plain-text Apple Mail reply where new text precedes `Am 01.06.2026 um 10:00 schrieb Max:` followed by `>`-prefixed lines, WHEN `parseEmailBody(raw)`, THEN `body` equals only the text above the attribution line and `quoted` contains the attribution and `>` lines.
- GIVEN a German Outlook reply with a `Von: … Gesendet: … An: … Betreff: …` block, WHEN `parseEmailBody(raw)`, THEN `body` contains no text from that block or below.
- GIVEN a message ending with `-- \nLukas Pustina`, WHEN `parseEmailBody(raw)`, THEN `signature` contains the delimiter and name, and `body` does not.
- GIVEN a message whose new text is empty after stripping (forward with no added content), WHEN `parseEmailBody(raw)`, THEN `body` is `""`.
- GIVEN text after a quoted attribution line that does not start with `>` (inline reply style), WHEN `parseEmailBody(raw)`, THEN that text is retained in `body`.
- GIVEN `[{name:"image001.png", mimeType:"image/png", size:2048}, {name:"Angebot.pdf", mimeType:"application/pdf", size:81920}]`, WHEN `filterAttachments(all)`, THEN result contains only `Angebot.pdf` and the input array is not mutated.
- GIVEN an `image/png` attachment with `size: -1` (unknown), WHEN `filterAttachments`, THEN it is filtered out.
- GIVEN sender `"Pustina, Lukas"`, subject `"AW: Angebot [#123]"`, and `body = ""`, WHEN `formatEmailSection(meta, "", [], locale)`, THEN `sectionName` contains no `,`, `]]`, `|`, or `#` characters; `bodyLines` is exactly one line: the `- siehe [E-Mail von …](message://…)` link.
- GIVEN sender `"Alice"`, subject `"Re: Meeting"`, body `"Sounds good."`, one attachment `{name:"Brief.pdf", mimeType:"application/pdf", size:81920}`, WHEN `formatEmailSection`, THEN `bodyLines` is `["- siehe [E-Mail von Alice: Meeting](message://…)", "Sounds good.", "Anhänge: Brief.pdf"]` in that order.
- GIVEN subject `"FWD: Re: AW: Topic"`, WHEN `formatEmailSection`, THEN `sectionName` starts with `E-Mail von … Topic` (all recognized prefixes stripped).
- GIVEN subject `"AW:"` (prefix only), WHEN `formatEmailSection`, THEN `sectionName` uses the original subject `"AW:"` as fallback (stripped result was empty).

## Phase 2 — Shared reuse extensions

Extend `addVorgangSection` in `vorgang-engine.ts` with optional `bodyLines?: string[]`. Add optional label overrides (`skipLabel?`, `dropLabel?`, `openLabel?`) to `SectionNoteSuggestOptions`. Add `nameMatchOnly?: boolean` to `SuggestOptions` in `besprechung-suggest-engine.ts`. All changes are backward-compatible (defaults preserve existing behavior).

Phase complete when: new unit tests for `addVorgangSection` with body lines and `suggestFilingTargets` name-match-only mode pass; all existing besprechung and vorgang tests still pass; `npm run test` green.

### Test Scenarios

- GIVEN a Vorgang note with `# Inhalt` and existing TOC entries, WHEN `addVorgangSection(content, "Müller", locale, date, ["line1", "line2"])`, THEN the inserted h5 section contains `line1` and `line2` as body lines and the TOC gains one wikilink bullet.
- GIVEN `addVorgangSection` called without `bodyLines` argument, WHEN the call completes, THEN all existing vorgang tests pass unchanged.
- GIVEN `suggestFilingTargets("Angebot Müller", [], ["Müller GmbH", "Schmidt AG"], { nameMatchOnly: true })`, WHEN called, THEN `"Müller GmbH"` ranks first.
- GIVEN `SectionNoteSuggestModal` constructed with `{ skipLabel: "Überspringen", dropLabel: "Nicht archivieren" }`, WHEN the modal renders, THEN virtual sentinels display those labels instead of the defaults.
- GIVEN all existing besprechung and vorgang unit and acceptance tests, WHEN run after Phase 2 changes, THEN all pass.

## Phase 3 — Mail bridge

Implement `createOsascriptBridge` in `mail-bridge.ts` with JXA scripts (as string constants) for `listInbox`, `listAccounts`, `fetchBody`, `archive`, `isInInbox` (transport locked to JXA — see Decision Log). Per-message methods scope their JXA search to the named account. Archive resolves the account's configured mailbox from the `archiveMailboxes` map or `defaultArchiveMailbox` (no provider special-casing — see Decision Log). Handle TCC denial (err -1743) by throwing a human-readable error. Handle not-found by throwing (callers catch and skip).

Phase 3 has no automated CI gate. Correctness is validated via a manual smoke checklist (run against real Apple Mail before Phase 4).

Phase complete when: the module compiles and typechecks (`npm run build` green) and all manual smoke checks below pass.

### Test Scenarios

*(Manual smoke-test checklist — not CI-automated)*

- GIVEN a real inbox with at least one message, WHEN `listInbox()`, THEN each entry has non-empty `id`, `accountName`, `subject`, and a parseable ISO `dateSent`.
- GIVEN configured Mail accounts, WHEN `listAccounts()`, THEN it returns each account's display name (the keys the settings "Detect accounts" button will populate).
- GIVEN a message id not present in any inbox account, WHEN `archive(accountName, id)`, THEN the call resolves without throwing (no-op).
- GIVEN a message in each configured account, WHEN `archive` with that account's configured mailbox then `isInInbox`, THEN `isInInbox` returns `false`. For Gmail: determine empirically which mailbox name drains the inbox (e.g. `"Archive"`, `"[Gmail]/All Mail"`, localized `"Alle Nachrichten"`) and record it as the account's configured value. If no mailbox-move drains the Gmail inbox, implement a Gmail-specific "remove Inbox label" JXA path within this phase (the generic-move design is otherwise unchanged).
- GIVEN macOS TCC denies Obsidian→Mail (err -1743), WHEN any bridge method is called, THEN the bridge throws an error whose `message` instructs the user to grant Automation for Mail in System Settings.

## Phase 4 — Feature, preview modal, settings, wiring

Implement `EmailPreviewModal` in `src/features/email-filing/email-preview-modal.ts` (textarea for body, read-only fields for sender/subject/date/target note name, confirm/cancel buttons). Implement `EmailFilingFeature` with: concurrent-walk guard, the `next()` walk loop, `SectionNoteSuggestModal` with label overrides and name-match-only suggestions, preview-on-Pick, the archive-first→verify→modify contract, Don't-file / Skip / Stop+open handlers. Implement `EmailFilingSettings` UI in `email-filing-settings.ts`, including the "Detect accounts" button that calls `MailBridge.listAccounts()` and pre-fills missing `archiveMailboxes` keys. Wire into `main.ts` and `src/types.ts`. Update README, CLAUDE.md, TODO.md.

Phase complete when: acceptance tests covering all scenarios below pass with a fake `MailBridge` + mocked vault; `npm run test` and `npm run build` both green; docs updated.

### Test Scenarios

- GIVEN two inbox messages `[A, B]` (oldest first) and a Vorgang note, WHEN "File inbox emails" is invoked and user picks the Vorgang for A, edits body, confirms, THEN `archive(A.accountName, A.id)` is called, `isInInbox(A.accountName, A.id)` returns `false`, the Vorgang note gains a new h5 section with the edited body, and the walk advances to B.
- GIVEN message A, WHEN user chooses Don't-file, THEN `archive(A.accountName, A.id)` is called, no `vault.modify` occurs, and the walk advances to B.
- GIVEN message A, WHEN user chooses Skip, THEN neither `archive` nor `vault.modify` is called and the walk advances to B.
- GIVEN message A, WHEN user chooses Stop+open, THEN the walk halts and `open("message://<A.id>")` is invoked; no further picker modal opens.
- GIVEN `archive(A.accountName, A.id)` rejects (bridge throws), WHEN Pick → confirm, THEN `vault.modify` is not called and a Notice containing A's subject and its `message://` URL is shown.
- GIVEN `archive(A.accountName, A.id)` resolves but `isInInbox(A.accountName, A.id)` returns `true`, WHEN Pick → confirm, THEN `vault.modify` is not called and an error Notice is shown.
- GIVEN `vault.modify` throws after a successful archive and `isInInbox` returning `false`, WHEN Pick → confirm, THEN a Notice states the message was archived but not filed into the target note name; the walk advances.
- GIVEN `emailFiling.order = "newest"` and messages `[older, newer]`, WHEN the walk starts, THEN `newer` is presented first.
- GIVEN "File inbox emails" is invoked while a walk is already in progress, THEN a Notice "Walk läuft bereits" is shown and the second invocation returns immediately without affecting the first.
- GIVEN a fake `MailBridge` whose `listAccounts()` returns `["iCloud", "Gmail"]` and `archiveMailboxes = { "iCloud": "Archive" }`, WHEN the "Detect accounts" button is clicked, THEN `archiveMailboxes` gains a `"Gmail"` key valued `defaultArchiveMailbox` and the `"iCloud"` entry is unchanged.

## Decision Log

- **Persistent per-email notes (rejected).** User does not want "Besprechung-like doubles." The relevant body moves into the Vorgang; the email stays in Mail.
- **Message-ID vault ledger (rejected).** With inbox-zero, inbox membership is the pending queue; archiving drains it. No ledger needed — at the cost that a failed archive can double-file (mitigated by the archive-first→verify contract).
- **Thread-level filing (rejected).** Fights inbox-zero; replies arrive as fresh inbox messages and are filed as they come. Message-level chosen; newest message embeds prior quotes anyway.
- **Two-stage AppleScript export / CLI-driven ingest (rejected).** User wanted the single-command walk feel with the fuzzy picker; the plugin shells out to `osascript` directly.
- **Flag / mark-read as the "done" marker (rejected).** Move-to-Archive is the inbox-zero-native drain; mark-read conflates with "read but not filed."
- **HTML→markdown body in v1 (deferred to v2).** Requires MIME parsing of `source` + turndown; Outlook (the dominant case) uses no `blockquote`, so the heuristic is still needed. v1 uses plain-text extraction only.
- **Single-shot "File selected message" as v1 (changed).** Initially recommended as the simpler v1; user requires the walk in v1. Single-shot is out of scope (trivially addable later).
- **Highlight-to-copy body source (not applicable to walk).** Worked only for single-shot (human in Mail). The walk has no per-message highlight; hence the editable preview modal restores human-in-the-loop.
- **Aggressive quote-trimming (changed to under-trim).** The `message://` link is a pointer, not a copy — recoverable only while the archived mail exists — so the extractor biases toward keeping content.
- **`filterAttachments` placed in `email-format-engine.ts` (not `email-quote-engine.ts`).** Attachment filtering is a formatting concern unrelated to quote/signature stripping. Keeping them in the same file would violate SRP.
- **`EmailPreviewModal` placed in `src/features/email-filing/` (not `src/shared/modals/`).** The modal is email-filing-specific with no other callers. Shared modals are for cross-feature reuse.
- **`SuggestOptions.nameMatchOnly` flag (not weight exposure).** The only required behavior is name-match-only ranking; exposing tunable weights would be YAGNI. Passing `corpus = []` with a `nameMatchOnly: true` flag is the minimal interface.
- **Gmail archive resolved: generic move + `isInInbox` verify, no provider special-casing (v1).** Archiving moves the message to the account's configured mailbox; `isInInbox` is the loud safety net against a silent no-op. The correct mailbox name per account (including Gmail's) is determined empirically in the Phase 3 smoke test and stored in `archiveMailboxes`. A Gmail-specific "remove Inbox label" path is built only if Phase 3 proves no mailbox-move drains the Gmail inbox. Chosen over hardcoding `[Gmail]/All Mail` (often a no-op for Inbox removal) to keep v1 provider-agnostic.
- **Transport resolved: JXA (`osascript -l JavaScript`).** Chosen over hand-delimited AppleScript because `JSON.stringify` eliminates delimiter-escaping bugs for arbitrary body/subject text — the dominant correctness risk. At inbox-zero scale JXA's latency is acceptable; `listInbox` reads only lightweight metadata and bodies are fetched one at a time. The `MailBridge` interface stays transport-agnostic so `listInbox` alone could later move to AppleScript without touching the feature.
- **Config UX resolved: "Detect accounts" button populates `archiveMailboxes` keys (v1).** A button (not auto-on-open) calls `listAccounts()` so osascript/TCC is only triggered on demand. Chosen over manual-only entry because typing each account's exact internal name is a silent-misroute footgun, and over auto-on-open to avoid firing osascript every settings open. Requires the `listAccounts()` bridge method.
- **`MailBridge` instance lifecycle: reconstruct on settings save.** `createOsascriptBridge` captures `archiveMailboxes` at construction time. The feature recreates the bridge whenever settings are saved to pick up map changes. This is simpler than passing the map per-call.
- **`mergeSettings` falls back to `DEFAULT_EMAIL_FILING_SETTINGS` for missing keys.** Consistent with all existing features.
- **`isInInbox` retained in core contract.** The quality review noted this adds a round-trip JXA call. However, the archive-first→verify ordering is load-bearing: it prevents `vault.modify` from running when archive was silently ineffective (particularly relevant for the unresolved Gmail Open Decision). Removing it would remove the only guard against double-filing after a silent no-op. The Gmail-archive concern this guards against is now resolved (generic move + verify; see above).

## Open Decisions

None — all three prior open decisions (Gmail archive semantics, enumeration transport, per-account config UX) are resolved; see the Decision Log. The Gmail mailbox name remains an empirical Phase 3 validation task, not an open design choice.

## Out of Scope

- HTML→markdown body conversion (v2).
- Attachment content extraction (PDF/Office text) and copying attachment files into the vault.
- Single-shot "File selected Mail message" command.
- Thread-level filing.
- Persistent email notes, Message-ID ledger, and `filed_into` routing-training data for email.
- Obsidian mobile and non-Apple-Mail clients.
- Diary entry creation on filing (Besprechung does this; not requested for email).
- Auto-populating `archiveMailboxes` on settings-open (v1 uses an explicit "Detect accounts" button instead).
- Tunable weight exposure on `suggestFilingTargets` beyond the `nameMatchOnly` flag.
