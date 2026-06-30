# SDD: Email Filing (Apple Mail → Vorgang)

Status: Ready for Implementation
Original: specs/sdd/email-filing.md
Refined: 2026-06-30

## Overview

A new LuKit feature that walks the Apple Mail inbox one message at a time and files each into a section note (Vorgang/Person/Bestellung/Bewerbung), mirroring the Besprechung "File pending notes" flow. For each message the user picks a target, edits the extracted body in a preview modal, and the message is archived in Mail and embedded as an h5 section in the target note. The inbox is the pending queue; archiving drains it; no email state is stored in the vault.

## Context & Constraints

- **Stack:** TypeScript strict (no `any`), Obsidian desktop plugin, Vitest, esbuild. Node `child_process` available (desktop-only — this feature is macOS-only, consistent with LuKit's CLI/LaunchBar).
- **Conventions:** Feature module pattern — pure `*-engine.ts` (no Obsidian/Mail imports, fully unit-testable) + `*-feature.ts` (Obsidian wiring) + `*-settings.ts`. Explicit return types, named exports, early returns. Section names/dates use the global `dateLocale`.
- **Reuse:** `SectionNoteSuggestModal` (shared picker), `addVorgangSection` (vorgang-engine, plain `##### name, DD.MM.YYYY` header — not `addVorgangSectionLinked`), `suggestFilingTargets` (besprechung-suggest-engine), `text-input-modal`/`text-date-modal` (shared modals). The walk structure mirrors BesprechungFeature's "File pending notes" sequential `next()` callback chain.
- **Bridge fragility:** Apple Mail is reachable only via `osascript`; the bridge is the only impure, least-testable surface and concentrates the highest risk (per-account archive, Gmail, body quirks). It is injected so the feature is testable with a fake.
- **Security — osascript injection:** All runtime values (`accountName`, `messageId`, mailbox names) MUST be passed to `osascript` as command-line arguments (via `$.NSProcessInfo.processInfo.arguments` inside JXA) — NEVER interpolated into the JXA script source string.
- **Process spawning:** The bridge uses `child_process.execFile` (not `exec`/`execSync`) for all `osascript` invocations and for the `open("message://…")` call (Req 9). No shell is spawned.
- **esbuild:** `'child_process'` must be added to the `external` array of the plugin bundle in `esbuild.config.mjs` (Electron provides Node builtins at runtime; do not set `platform: "node"` for the plugin bundle as it may break DOM APIs). The CLI bundle (separate entry, `platform: "node"`) is unaffected.
- **PII logging:** `console.error`/`console.warn` calls for bridge failures log only the error code/type — never the email subject or sender name. On-screen Notices may include subject/sender; console output may not.

## Architecture

```
"File inbox emails" command (email-filing-feature.ts)
   │
   ├─ MailBridge.listInbox()  ──► [osascript JXA]  metadata only
   │      │
   │      └─ [] → Notice "Inbox ist leer."; return
   │
   └─ for each message (next() chain):
        ├─ MailBridge.fetchBody(account,id) ──► [osascript JXA]  lazy
        │      └─ not found → Notice + Skip + advance
        ├─ parseEmailBody(raw)        (email-quote-engine.ts, pure)
        ├─ filterAttachments(all)     (email-format-engine.ts, pure)
        ├─ suggestFilingTargets(title, [], candidateBasenames, { now, minScore })
        │      (besprechung-suggest-engine.ts, empty corpus = name-match only)
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
4. The system shall, for each message, open `SectionNoteSuggestModal` with Pick, Skip, Don't-file, and Stop+open entries, and name-match suggestions pinned on top, ranked by calling `suggestFilingTargets` with an empty history corpus and a title composed of the stripped subject and sender name, with an explicit `minScore` low enough that name-match suggestions clear the threshold (since the maximum score with an empty corpus is `NAME_MATCH_WEIGHT`).
5. On Pick, the system shall open `EmailPreviewModal` pre-filled with the extracted email body (editable textarea) and read-only header fields (sender, subject, date, target note name); the user confirms or edits before filing.
6. On confirm in `EmailPreviewModal`, the system shall: (a) call `MailBridge.archive(accountName, messageId)`, (b) call `MailBridge.isInInbox(accountName, messageId)` and treat `true` as failure, then (c) call `vault.modify` to insert the h5 section — in that order. If any step fails the system shall show an error Notice, not execute subsequent steps, and advance to the next message.
7. On Don't-file, the system shall archive the message without modifying any note.
8. On Skip, the system shall leave the message in the inbox and advance to the next.
9. On Stop+open (and on ESC), the system shall halt the walk; Stop+open shall additionally open the current message in Apple Mail by invoking `child_process.execFile("open", [meta.messageUrl])`, where `meta.messageUrl` is the pre-built percent-encoded `message://` URL from `EmailMeta` (constructed by `buildMessageUrl` in the bridge — not re-encoded at the call site).
10. The system shall extract the new content of a message body by removing quoted history and signature using the following priority order (documented as a code comment in `email-quote-engine.ts`): (1) remove `"-- "` (dash dash space) signature delimiter and everything below it; (2) remove known disclaimer markers and everything below them — in v1 only `"-- "` is recognized; other markers are deferred to v2; (3) remove `-----Ursprüngliche Nachricht-----` separators and everything below; (4) remove German Outlook `Von:/Gesendet:/An:/Betreff:` header block and everything below; (5) remove Apple Mail `Am … schrieb …:` attribution lines and all following `>`-prefixed lines. Under-trim rule: when a line is ambiguous, keep it. Text after a quoted attribution line that does not start with `>` is retained in `body`.
11. The system shall format each filed section as a plain h5 heading with a TOC bullet, a `- siehe [E-Mail von <sender>](message://<encoded-id>)` link line, the (edited) body, and — when present — a `Anhänge: <names>` line.
12. The system shall list only real attachments via `filterAttachments`, filtering out all `image/*` attachments with `size <= 51200` bytes (50 × 1024), and attachments with `size === -1` (unknown size reported by JXA) are treated as size 0 and filtered if their mimeType is `image/*`. The system shall never copy attachment files into the vault.
13. The system shall sanitize `senderName` and `subject` before building the heading and link, removing or replacing `,` `]]` `|` `#` characters so they do not collide with the vorgang `name, DD.MM.YYYY` heading convention or break markdown links.
14. The system shall strip recognized prefixes (`AW:`, `Re:`, `Fwd:`, `FWD:`, `WG:`, case-insensitive, possibly repeated) from subject before ranking and building the section name. If stripping leaves an empty or whitespace-only subject, the system shall fall back to the original subject.
15. The system shall rank filing suggestions by name-match only, achieved by calling `suggestFilingTargets` with an empty history corpus (`[]`) and a title composed of the stripped subject and sender name; no `nameMatchOnly` flag is needed or defined.
16. The system shall store no email state in the vault (no per-email notes, no Message-ID ledger).
17. The system shall degrade an empty extracted body to just the link line (forward-only / attachment-only mail).
18. The system shall expose the mail bridge behind an injectable `MailBridge` interface so the feature is acceptance-testable without Apple Mail.
19. The system shall show a Notice "Inbox ist leer." and return immediately when `listInbox()` returns an empty array.
20. The system shall guard against concurrent walks: if "File inbox emails" is invoked while a walk is in progress, it shall show a Notice "Walk läuft bereits." and return immediately. The walk guard is cleared when the walk finishes (all messages processed, or user stops), including on uncaught exceptions, implemented with a `try/finally` block.
21. The system shall handle a missing sender display name by falling back to the raw email address (bridge-side: JXA must return the sender address when display name is absent).
22. All JXA bridge calls (`listInbox`, `fetchBody`, `archive`, `isInInbox`) shall search and operate within the named account only, so that duplicate Message-IDs across accounts do not cause cross-account interference.
23. The settings UI shall provide a "Detect accounts" button that calls `MailBridge.listAccounts()` and, for each returned account not already present in `archiveMailboxes`, adds a key with its value defaulted to `defaultArchiveMailbox`; existing entries are left unchanged.
24. No upper bound on `listInbox()` result size is enforced in v1; the walk processes all inbox messages.

## File & Module Structure

New files:
- `src/features/email-filing/email-quote-engine.ts` — pure: `parseEmailBody` (quote + signature stripping). `ParsedEmail` exposes `body` only (see Data Models).
- `src/features/email-filing/email-format-engine.ts` — pure: `formatEmailSection`, `filterAttachments`, `sanitizeSenderSubject`, `stripSubjectPrefixes`, `buildMessageUrl`.
- `src/features/email-filing/mail-bridge.ts` — impure: `MailBridge` interface + `createOsascriptBridge`; JXA scripts as string constants; all runtime values passed as argv arguments, read in JXA via `$.NSProcessInfo.processInfo.arguments`.
- `src/features/email-filing/email-filing-feature.ts` — `LuKitFeature`: command, concurrent-walk guard (`try/finally`), walk loop, picker wiring, preview-on-Pick, archive-first→verify→modify contract. `renderSettings(containerEl, plugin)` implemented inline on the feature class (not delegated to a helper) so `this.bridge` is reachable for the "Detect accounts" button.
- `src/features/email-filing/email-filing-settings.ts` — `EmailFilingSettings`, `DEFAULT_EMAIL_FILING_SETTINGS`.
- `src/features/email-filing/email-preview-modal.ts` — editable body preview modal (textarea + confirm/cancel); email-filing-specific, not shared.
- `tests/unit/email-quote-engine.test.ts` — fixtures for Apple Mail, German Outlook, nested quotes, signature/disclaimer variants, under-trim edge cases.
- `tests/unit/email-format-engine.test.ts` — fixtures for sanitization, prefix stripping, empty body, attachment filtering, `buildMessageUrl`.
- `tests/acceptance/email-filing-feature.test.ts` — walk flow with fake `MailBridge` + mocked vault covering all pick actions and error paths.

Modified files:
- `src/features/vorgang/vorgang-engine.ts` — `addVorgangSection` gains optional `bodyLines?: string[]` passed through to `insertVorgangContent`; default `[]`. This is the plain-heading function, not `addVorgangSectionLinked`. `insertVorgangContent` already handles `bodyLines` in all three branches; the change is a one-line passthrough.
- `src/shared/modals/section-note-suggest.ts` — `SectionNoteSuggestOptions` gains optional `skipLabel?: string`, `dropLabel?: string`, `openLabel?: string`; each defaults to the current hardcoded string.
- `src/types.ts` — add `emailFiling: EmailFilingSettings` to `LuKitSettings` interface; add `emailFiling: { ...DEFAULT_EMAIL_FILING_SETTINGS }` to `DEFAULT_SETTINGS`; update `mergeSettings` with `emailFiling: { ...DEFAULT_EMAIL_FILING_SETTINGS, ...(saved.emailFiling ?? {}) }` (top-level spread alone does not deep-merge nested `archiveMailboxes` — use the explicit per-key spread matching the existing `workDiary`/`besprechung` pattern).
- `src/main.ts` — import and register `EmailFilingFeature`.
- `esbuild.config.mjs` — add `'child_process'` to the `external` array of the plugin bundle entry only (not the CLI bundle).
- `tests/helpers/obsidian-mocks.ts` — `makeTestSettings` must accept an `emailFiling` override: `emailFiling: { ...DEFAULT_EMAIL_FILING_SETTINGS, ...(overrides.emailFiling ?? {}) }` so acceptance tests typecheck under strict mode.
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
  /** Moves the message to the account's configured archive mailbox. Throws on failure or if not found. */
  archive(accountName: string, messageId: string): Promise<void>;
  /** Returns true if the message is still present in the named account's inbox. */
  isInInbox(accountName: string, messageId: string): Promise<boolean>;
}

/**
 * Creates a real MailBridge backed by osascript JXA.
 * All runtime values are passed as argv to osascript — never interpolated.
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
  /** Removed quoted block (diagnostic; not surfaced to callers in v1). */
  quoted: string;
  /** Removed signature block (diagnostic; not surfaced to callers in v1). */
  signature: string;
}

export function parseEmailBody(raw: string): ParsedEmail;

// src/features/email-filing/email-format-engine.ts

export interface EmailMeta {
  senderName: string;
  subject: string;
  dateSent: Date;
  /** Full percent-encoded URL, e.g. "message://3D%40example.com". Constructed by the bridge via buildMessageUrl. */
  messageUrl: string;
}

/**
 * Percent-encodes a bare Message-ID (without angle brackets) into a message:// URL.
 * Used by the bridge when constructing RawMailMessageMeta; ensures encoding is canonical and testable.
 * Example: buildMessageUrl("foo@bar.com") → "message://foo%40bar.com"
 */
export function buildMessageUrl(messageId: string): string;

/**
 * Sanitizes a single string value (sender name or subject) by removing/replacing
 * characters that collide with the vorgang heading convention or break markdown links:
 * , → (removed), ]] → ] (collapsed), | → - (replaced), # → (removed).
 */
export function sanitizeSenderSubject(value: string): string;

/**
 * Strips recognized reply/forward prefixes (AW:, Re:, Fwd:, FWD:, WG:, case-insensitive,
 * possibly repeated) from the beginning of a subject string.
 * Returns the trimmed remainder, or the original subject if stripping yields empty/whitespace.
 */
export function stripSubjectPrefixes(subject: string): string;

/**
 * Returns the section name (without date suffix — caller passes date separately to addVorgangSection)
 * and the body lines to insert under the h5 heading.
 * sectionName = "E-Mail von <sanitizedSender>: <sanitizedStrippedSubject>"
 * bodyLines: ["- siehe [E-Mail von <sanitizedSender>: <sanitizedStrippedSubject>](<messageUrl>)", ...body lines (if any), "Anhänge: <name1>, <name2>" (if any)]
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

// src/features/email-filing/email-preview-modal.ts

/**
 * Modal pre-filled with the extracted email body (editable) and read-only header fields.
 * Calls onConfirm with the (possibly edited) body text when the user confirms.
 * Calls onCancel when the user cancels or closes the modal.
 */
export class EmailPreviewModal extends Modal {
  constructor(
    app: App,
    meta: EmailMeta,
    body: string,
    targetNoteName: string,
    onConfirm: (editedBody: string) => void,
    onCancel: () => void,
  );
}

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

Updated signatures for modified functions:

```ts
// src/features/vorgang/vorgang-engine.ts (modified)
export function addVorgangSection(
  content: string,
  name: string,
  locale: DateLocale,
  date?: Date,
  bodyLines?: string[],
): { newContent: string; cursorLineIndex: number };

// src/shared/modals/section-note-suggest.ts (modified)
export interface SectionNoteSuggestOptions {
  placeholder: string;
  onPick: (note: TFile) => void;
  onSkip?: () => void;
  onDrop?: () => void;
  onOpenSource?: () => void;
  onCancel?: () => void;
  skipLabel?: string;   // defaults to current hardcoded string
  dropLabel?: string;   // defaults to current hardcoded string
  openLabel?: string;   // defaults to current hardcoded string
}
```

## Configuration

Settings key: `emailFiling` (added to `LuKitSettings`).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `emailFiling.order` | `"oldest" \| "newest"` | `"oldest"` | Walk order by `dateSent`. |
| `emailFiling.defaultArchiveMailbox` | `string` | `"Archive"` | Fallback archive mailbox for unmapped accounts. |
| `emailFiling.archiveMailboxes` | `Record<string, string>` | `{}` | Per-account archive mailbox overrides. Keys are Mail account display names. |

Settings UI: `renderSettings(containerEl, plugin)` is implemented inline on `EmailFilingFeature` (not delegated to a standalone helper) so `this.bridge` is accessible for the "Detect accounts" button. The UI renders: a `defaultArchiveMailbox` text field above the per-account map; one labeled text field per entry in `archiveMailboxes`; a "+ Add account" button to add a key/value pair manually; and a "Detect accounts" button that calls `this.bridge.listAccounts()` and pre-fills the map with any missing account keys (value defaulted to `defaultArchiveMailbox`), leaving existing entries untouched. A failed `listAccounts()` call (e.g. TCC denial) shows a Notice and leaves the map unchanged.

`mergeSettings` in `src/types.ts`: `emailFiling: { ...DEFAULT_EMAIL_FILING_SETTINGS, ...(saved.emailFiling ?? {}) }`. The explicit spread is required because a top-level spread alone would not deep-merge the nested `archiveMailboxes` record.

The `createOsascriptBridge` instance is constructed once at feature `onload` and reconstructed whenever settings are saved (to pick up changes to `archiveMailboxes`).

## Error Handling

| Failure | Trigger | Behaviour | User-visible |
|---------|---------|-----------|--------------|
| Automation denied | macOS TCC blocks Obsidian→Mail (err -1743) | Bridge throws; abort walk | Notice: "Bitte erlaube Obsidian den Zugriff auf Mail in den Systemeinstellungen → Datenschutz → Automatisierung." |
| Archive throws | Bad mailbox name / IMAP error / not found | Do **not** call `isInInbox` or `vault.modify`; advance walk | Notice with subject + `message://` link |
| Archive no-op | `isInInbox` returns `true` after archive | Do **not** call `vault.modify`; advance walk | Notice: "Archivierung hat die Nachricht nicht aus dem Posteingang entfernt. Bitte Postfach-Konfiguration prüfen." |
| fetchBody not found | Message deleted between listInbox and its turn | Skip; advance | Notice: "Nachricht nicht mehr im Posteingang: <subject>" |
| vault.modify fails | Vault write error after successful archive | Report partial state; advance walk | Notice: "Archiviert, aber nicht in „<noteName>" abgelegt." |
| Empty body | Forward / attachment-only mail | File link line (+ attachments) only | Normal success Notice |
| Empty inbox | `listInbox()` returns `[]` | Return immediately | Notice: "Inbox ist leer." |
| Concurrent walk | Command invoked while walk in progress | Return immediately | Notice: "Walk läuft bereits." |
| listAccounts fails | TCC denial or scripting error during "Detect accounts" | Show Notice; leave archiveMailboxes unchanged | Notice describing the failure |

`console.error`/`console.warn` calls for all bridge failures log only the error code/type — never the email subject or sender name.

## Implementation Phases

## Phase 1 — Pure email engines

Implement `parseEmailBody` in `email-quote-engine.ts` and `buildMessageUrl`, `sanitizeSenderSubject`, `stripSubjectPrefixes`, `filterAttachments`, `formatEmailSection` in `email-format-engine.ts`. No Obsidian, no Mail imports. `filterAttachments` lives in `email-format-engine.ts` (not `email-quote-engine.ts`) to keep modules single-responsibility.

Heuristic priority order for `parseEmailBody` (documented as a code comment in the module):

1. Remove `"-- "` (dash dash space) signature delimiter and everything below it. In v1 only this delimiter is recognized; other disclaimer markers are deferred to v2.
2. Remove `-----Ursprüngliche Nachricht-----` separators and everything below.
3. Remove German Outlook `Von:/Gesendet:/An:/Betreff:` header block and everything below.
4. Remove Apple Mail `Am … schrieb …:` attribution lines and all following `>`-prefixed lines.
5. Under-trim rule: when a line is ambiguous, keep it. Text after an attribution line that does not start with `>` is retained in `body`.

`ParsedEmail` has three fields (`body`, `quoted`, `signature`); only `body` is consumed by callers in v1. The `quoted` and `signature` fields are available for diagnostic use but are not surfaced to the feature layer.

Phase complete when: all unit tests pass against the fixtures below; `npm run test` green.

### Test Scenarios

- GIVEN a plain-text Apple Mail reply where new text precedes `Am 01.06.2026 um 10:00 schrieb Max:` followed by `>`-prefixed lines, WHEN `parseEmailBody(raw)`, THEN `body` equals only the text above the attribution line and contains no `>` characters from the quoted block; `quoted` contains the attribution and `>` lines.
- GIVEN a German Outlook reply with a `Von: … Gesendet: … An: … Betreff: …` block, WHEN `parseEmailBody(raw)`, THEN `body` contains no text from that block or below.
- GIVEN a message ending with `\n-- \nLukas Pustina`, WHEN `parseEmailBody(raw)`, THEN `signature` begins with `-- ` and `body` does not contain `-- ` or the name.
- GIVEN a message whose new text is empty after stripping (forward with no added content), WHEN `parseEmailBody(raw)`, THEN `body === ""`.
- GIVEN text after a quoted attribution line that does not start with `>` (inline reply style), WHEN `parseEmailBody(raw)`, THEN that text is retained in `body`.
- GIVEN `[{name:"image001.png", mimeType:"image/png", size:2048}, {name:"Angebot.pdf", mimeType:"application/pdf", size:81920}]`, WHEN `filterAttachments(all)`, THEN result contains only `Angebot.pdf` and the input array is not mutated.
- GIVEN an `image/png` attachment with `size: -1` (unknown), WHEN `filterAttachments([it])`, THEN result is `[]`.
- GIVEN sender `"Pustina, Lukas"`, subject `"AW: Angebot [#123]"`, and `body = ""`, WHEN `formatEmailSection(meta, "", [], locale)`, THEN `sectionName` contains no `,`, `]]`, `|`, or `#` characters; `bodyLines` has exactly one element starting with `- siehe [E-Mail von `.
- GIVEN sender `"Alice"`, subject `"Re: Meeting"`, body `"Sounds good."`, one attachment `{name:"Brief.pdf", mimeType:"application/pdf", size:81920}`, WHEN `formatEmailSection`, THEN `bodyLines === ["- siehe [E-Mail von Alice: Meeting](message://…)", "Sounds good.", "Anhänge: Brief.pdf"]` in that order.
- GIVEN subject `"FWD: Re: AW: Topic"`, WHEN `formatEmailSection`, THEN `sectionName` contains `"Topic"` and does not begin with any recognized prefix.
- GIVEN subject `"AW:"` (stripping yields empty string), WHEN `formatEmailSection`, THEN `sectionName` uses the original subject `"AW:"` as fallback.
- GIVEN user edits the body textarea in `EmailPreviewModal` from `"original"` to `"edited"`, WHEN confirm is clicked, THEN `onConfirm` is called with `"edited"`.

## Phase 2 — Shared reuse extensions

Extend `addVorgangSection` in `vorgang-engine.ts` with optional `bodyLines?: string[]` (new last parameter), passed through to `insertVorgangContent`; default `[]`. The extension targets the plain-heading `addVorgangSection` function, not `addVorgangSectionLinked`. `insertVorgangContent` already accepts `bodyLines` in all three branches; the change is a one-line passthrough.

Add optional label overrides (`skipLabel?`, `dropLabel?`, `openLabel?`) to `SectionNoteSuggestOptions` in `src/shared/modals/section-note-suggest.ts`; each defaults to the current hardcoded string. All changes are backward-compatible.

Do NOT add a `nameMatchOnly` flag to `besprechung-suggest-engine.ts` — name-match-only ranking is achieved by passing an empty corpus (`[]`) directly to `suggestFilingTargets`, with an explicit `minScore` value low enough that name-match suggestions clear the threshold (since the maximum achievable score with an empty corpus equals `NAME_MATCH_WEIGHT`). No engine change is needed (see Decision Log).

Phase complete when: new unit tests for `addVorgangSection` with body lines pass; all existing besprechung and vorgang tests still pass; `npm run test` green.

### Test Scenarios

- GIVEN a Vorgang note with `# Inhalt` and existing TOC entries, WHEN `addVorgangSection(content, "Müller", locale, date, ["line1", "line2"])`, THEN the returned `newContent` contains `line1` and `line2` under the new h5 heading and the TOC gains exactly one new wikilink bullet.
- GIVEN `addVorgangSection` called without `bodyLines` argument, WHEN all existing vorgang unit tests are run, THEN all pass without modification.
- GIVEN `suggestFilingTargets("Angebot Müller", [], ["Müller GmbH", "Schmidt AG"], { now: <date>, minScore: 0.01 })`, WHEN called with an empty corpus, THEN `"Müller GmbH"` is the first element of the result.
- GIVEN `SectionNoteSuggestModal` constructed with `{ skipLabel: "Überspringen", dropLabel: "Nicht archivieren", onSkip: ..., onDrop: ... }`, WHEN the modal renders its suggestion list, THEN the virtual sentinels display those labels instead of the defaults.
- GIVEN all existing besprechung and vorgang unit and acceptance tests, WHEN run after Phase 2 changes, THEN all pass.

## Phase 3 — Mail bridge

Implement `createOsascriptBridge` in `mail-bridge.ts` with JXA scripts (as string constants) for `listInbox`, `listAccounts`, `fetchBody`, `archive`, `isInInbox`. All runtime values (`accountName`, `messageId`, mailbox names) are passed as command-line arguments to `osascript -l JavaScript` and read inside each JXA script via `$.NSProcessInfo.processInfo.arguments` — never interpolated into the script source. All bridge calls use `child_process.execFile` (no shell).

Per-message methods scope their JXA search to the named account. Archive resolves the account's configured mailbox from the `archiveMailboxes` map or falls back to `defaultArchiveMailbox`; no provider special-casing in v1 (see Decision Log — Gmail correctness is validated empirically in the Phase 3 smoke test and recorded in `archiveMailboxes`). `archive` throws if the message is not found or if the move fails. Handle TCC denial (err -1743) by throwing with a `message` containing "Systemeinstellungen" and "Automatisierung". `buildMessageUrl` in `email-format-engine.ts` handles percent-encoding of message IDs; the bridge calls it when constructing `messageUrl` on each `RawMailMessageMeta`.

Phase 3 has no automated CI gate. Correctness is validated via the manual smoke checklist below. The implementer records smoke-test results in the commit message before proceeding to Phase 4.

Phase complete when: the module compiles and typechecks (`npm run build` green) and all manual smoke checks below pass.

### Test Scenarios

*(Manual smoke-test checklist — not CI-automated)*

- GIVEN a real inbox with at least one message, WHEN `listInbox()`, THEN each entry has non-empty `id`, `accountName`, `subject`, and `dateSent` parses as a valid ISO 8601 datetime.
- GIVEN configured Mail accounts, WHEN `listAccounts()`, THEN the array length equals the number of accounts visible in Mail and each element is a non-empty string.
- GIVEN a message in each configured account, WHEN `archive(accountName, id)` then `isInInbox(accountName, id)`, THEN `isInInbox` returns `false`. For Gmail: determine empirically which mailbox name drains the inbox and record it as the account's configured value in `archiveMailboxes`. If no generic mailbox-move drains the Gmail inbox, implement a Gmail-specific "remove Inbox label" JXA path as Phase 3b before proceeding to Phase 4.
- GIVEN macOS TCC denies Obsidian→Mail (err -1743), WHEN any bridge method is called, THEN the bridge throws with `message` containing "Systemeinstellungen" and "Automatisierung".

## Phase 4 — Feature, preview modal, settings, wiring

Implement `EmailPreviewModal` in `src/features/email-filing/email-preview-modal.ts`: textarea for body (pre-filled, editable), read-only fields for sender/subject/date/target note name, confirm/cancel buttons calling `onConfirm(editedBody)` / `onCancel()`.

Implement `EmailFilingFeature` with:
- Concurrent-walk guard (boolean field cleared in `try/finally`).
- `next()` walk loop over the sorted message list.
- `SectionNoteSuggestModal` with label overrides (`skipLabel`, `dropLabel`, `openLabel`) and suggestions from `suggestFilingTargets(title, [], candidateBasenames, { now, minScore })` with empty corpus.
- Preview-on-Pick via `EmailPreviewModal`.
- The archive-first → `isInInbox` verify → `vault.modify` contract (Req 6), with per-step error handling.
- Don't-file / Skip / Stop+open handlers.
- `renderSettings(containerEl, plugin)` implemented inline on the class (not delegated).

Wire into `src/main.ts` (import and register `EmailFilingFeature`) and `src/types.ts` (add `emailFiling` to `LuKitSettings`, `DEFAULT_SETTINGS`, and `mergeSettings` with explicit `{ ...DEFAULT_EMAIL_FILING_SETTINGS, ...(saved.emailFiling ?? {}) }`).

Add `'child_process'` to the plugin bundle's `external` array in `esbuild.config.mjs`. Update `tests/helpers/obsidian-mocks.ts` (`makeTestSettings` override). Update `README.md`, `CLAUDE.md`, `TODO.md`.

Phase complete when: acceptance tests covering all scenarios below pass with a fake `MailBridge` + mocked vault; `npm run test` and `npm run build` both green; docs updated.

### Test Scenarios

- GIVEN `listInbox()` returns `[]`, WHEN "File inbox emails" is invoked, THEN a Notice "Inbox ist leer." is shown and no picker modal opens.
- GIVEN two inbox messages `[A (older), B (newer)]` and `order = "oldest"`, WHEN walk starts, THEN the first picker subject references message A.
- GIVEN message A presented and user picks a Vorgang then confirms in `EmailPreviewModal`, THEN `archive(A.accountName, A.id)` is called, `isInInbox(A.accountName, A.id)` returns `false`, the Vorgang note gains a new h5 section with the edited body, and the walk advances to B.
- GIVEN user edits the body textarea from `"original"` to `"edited"` before confirming, WHEN `vault.modify` is called, THEN the inserted section contains `"edited"` (not `"original"`).
- GIVEN message A presented and user chooses Don't-file, THEN `archive(A.accountName, A.id)` is called, `vault.modify` is never called, and the walk advances to B.
- GIVEN message A presented and user chooses Skip, THEN neither `archive` nor `vault.modify` is called and the walk advances to B.
- GIVEN message A presented and user chooses Stop+open, THEN the walk halts and `execFile("open", [A.messageUrl])` is invoked with the pre-built URL; no further picker modal opens.
- GIVEN `archive(A.accountName, A.id)` rejects (bridge throws), WHEN Pick → confirm, THEN `vault.modify` is not called; a Notice containing A's subject and its `message://` URL is shown; the walk advances.
- GIVEN `archive(A.accountName, A.id)` resolves but `isInInbox(A.accountName, A.id)` returns `true`, WHEN Pick → confirm, THEN `vault.modify` is not called and an error Notice is shown; the walk advances.
- GIVEN `vault.modify` throws after a successful archive and `isInInbox` returning `false`, WHEN Pick → confirm, THEN a Notice states the message was archived but not filed into the target note name; the walk advances.
- GIVEN `order = "newest"` and messages `[older, newer]`, WHEN the walk starts, THEN `newer` is presented first.
- GIVEN "File inbox emails" is invoked while a walk is already in progress, THEN a Notice "Walk läuft bereits." is shown and the second invocation returns immediately without affecting the first.
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
- **`filterAttachments` placed in `email-format-engine.ts` (not `email-quote-engine.ts`).** Attachment filtering is a formatting concern unrelated to quote/signature stripping. SRP.
- **`EmailPreviewModal` placed in `src/features/email-filing/` (not `src/shared/modals/`).** The modal is email-filing-specific with no other callers. Shared modals are for cross-feature reuse.
- **Name-match-only via empty corpus + explicit `minScore`; no `nameMatchOnly` flag (simplification).** The prior `nameMatchOnly` flag on `SuggestOptions` was redundant — passing `corpus = []` achieves the same result without a leaky abstraction or any engine change. The caller passes `minScore` low enough to clear the `NAME_MATCH_WEIGHT` threshold. `besprechung-suggest-engine.ts` is not modified.
- **Gmail archive resolved: generic move + `isInInbox` verify, no provider special-casing (v1).** Archiving moves the message to the account's configured mailbox; `isInInbox` is the loud safety net against a silent no-op. The correct mailbox name per account (including Gmail's) is determined empirically in the Phase 3 smoke test and stored in `archiveMailboxes`. A Gmail-specific "remove Inbox label" path is built only if Phase 3 proves no mailbox-move drains the Gmail inbox (extracted as Phase 3b). Chosen over hardcoding `[Gmail]/All Mail` to keep v1 provider-agnostic.
- **Transport resolved: JXA (`osascript -l JavaScript`).** Chosen over hand-delimited AppleScript because `JSON.stringify` eliminates delimiter-escaping bugs for arbitrary body/subject text — the dominant correctness risk. `child_process.execFile` (no shell) is used for all invocations. All runtime values are passed as argv arguments, not interpolated. At inbox-zero scale JXA's latency is acceptable; `listInbox` reads only lightweight metadata and bodies are fetched one at a time. The `MailBridge` interface stays transport-agnostic.
- **Config UX resolved: "Detect accounts" button populates `archiveMailboxes` keys (v1).** A button (not auto-on-open) calls `listAccounts()` so osascript/TCC is only triggered on demand. Chosen over manual-only entry because typing each account's exact internal name is a silent-misroute footgun, and over auto-on-open to avoid firing osascript every settings open.
- **`MailBridge` instance lifecycle: reconstruct on settings save.** `createOsascriptBridge` captures `archiveMailboxes` at construction time. The feature recreates the bridge whenever settings are saved to pick up map changes. Simpler than passing the map per-call.
- **`mergeSettings` uses explicit per-key spread.** `emailFiling: { ...DEFAULT_EMAIL_FILING_SETTINGS, ...(saved.emailFiling ?? {}) }` — a top-level spread alone would not deep-merge the nested `archiveMailboxes` record.
- **`isInInbox` retained in core contract.** Adds a round-trip JXA call per Pick, but it is the only guard against `vault.modify` running when archive was silently ineffective. Removing it would remove protection against double-filing after a silent no-op. A code comment in `email-filing-feature.ts` documents this cost/tradeoff.
- **`renderSettings` inline on `EmailFilingFeature`.** Unlike BesprechungFeature (which delegates to a standalone helper), email-filing renders settings inline so `this.bridge` is reachable for the "Detect accounts" button without threading the bridge through a standalone helper parameter.
- **`archive` throws on not-found.** The error table row ("Archive throws — not found") takes precedence over the Phase 3 smoke scenario that previously described a silent no-op. `archive` throws when the message is not found; callers catch and advance the walk.
- **Disclaimer markers limited to `"-- "` in v1.** Only the `"-- "` (dash dash space) delimiter is recognized as a signature/disclaimer boundary. Other markers (e.g. "Mit freundlichen Grüßen") are deferred to v2 to avoid false-positive trimming.

## Open Decisions

None — all design choices are resolved. See the Decision Log.

## Out of Scope

- HTML→markdown body conversion (v2).
- Attachment content extraction (PDF/Office text) and copying attachment files into the vault.
- Single-shot "File selected Mail message" command.
- Thread-level filing.
- Persistent email notes, Message-ID ledger, and `filed_into` routing-training data for email.
- Obsidian mobile and non-Apple-Mail clients.
- Diary entry creation on filing (Besprechung does this; not requested for email).
- Auto-populating `archiveMailboxes` on settings-open (v1 uses an explicit "Detect accounts" button instead).
- Tunable weight exposure on `suggestFilingTargets` beyond calling with an empty corpus.
- Additional disclaimer markers beyond `"-- "` (v2).
