# SDD Implementation Report: email-filing-conversations.md

**Date**: 2026-07-01
**Phases run**: 1, 2, 3 (all)
**Overall status**: all-shipped (osascript bridge methods code-complete; live smoke test pending)
**Branch**: `feat/email-filing`

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Conversation assembly & dedup | shipped | 346c70f |
| 2 | Single-shot "File selected Mail message" | shipped | dcf489f |
| 3 | Cross-session routing (mine Vorgänge + cache) | shipped | 26dd3ac |

Full suite: **471 tests pass**; `npm run build` clean.

## Phase 1 — Conversation assembly & dedup

Filing an inbound email assembles the thread (inbound + the user's Sent replies via `listSentForThread`, matched by correspondent address + `threadKey`), dedups against the target Vorgang's `message://` ids (`extractFiledMessageIds`), renders one chronological section (`formatThreadSection`), and records the `threadKey` so the thread's other inbox messages auto-skip. Sent-retrieval failure degrades to inbound-only. Added `senderAddress` (via new `parseSenderAddress`), `sentMailboxes`/`defaultSentMailbox` settings (+ UI + Detect population), `mergeSettings` per-key spreads.

### Acceptance criteria
| Criterion | Status |
|-----------|--------|
| `extractFiledMessageIds` parses `message://%3C…%3E` | passing (unit) |
| `formatThreadSection` renders both directions, link after body | passing (unit) |
| Thread = inbound + matching Sent reply, in date order | passing (acceptance) |
| Sent-retrieval failure → inbound-only + Notice | passing |
| Non-matching-threadKey Sent message excluded | passing |
| Already-linked id not re-added (dedup) | passing |
| Filing records threadKey (auto-skip) | passing |

## Phase 2 — Single-shot "File selected Mail message"

Command `email-filing-file-selected`: files the Mail selection (any mailbox, incl. Sent) + its assembled thread into a picked Vorgang, **capture-only (never archives)**. `getSelection` returns id/account/direction/subject/party/date **plus body + attachments** (so any-mailbox selections can be filed without an INBOX-only `fetchBody`). Picker offers Pick + Don't-file; the edited preview body applies to the selected message.

### Acceptance criteria
| Criterion | Status |
|-----------|--------|
| Empty selection → Notice, stop | passing |
| Outbound selection filed, `archive` never called | passing |
| Inbound selection also capture-only (no archive) | passing |
| Already-linked selection not duplicated | passing |
| Multi-select order / ESC-halts | manual (modal-driven) |

## Phase 3 — Cross-session routing

`email-routing.ts` (`mineVorgangFilings`, `minedFilingsToFiledRecords`, `isCacheStale`, `ROUTING_CACHE_TTL_MS`). At walk/single-shot start the feature mines existing Vorgang `E-Mail von`/`E-Mail-Thread` headings into a `FiledRecord` corpus (subject as `rawTitle`), cached in `emailFiling.routingCache` (plugin data, 24h TTL, invalidated after each filing), combined with the in-walk memory for suggestions.

### Acceptance criteria
| Criterion | Status |
|-----------|--------|
| `mineVorgangFilings` parses both heading forms | passing (unit) |
| `minedFilingsToFiledRecords` uses subject as rawTitle | passing (unit) |
| `isCacheStale` (undefined / fresh / stale) | passing (unit) |
| Mined corpus surfaces a Vorgang without name-match | passing (acceptance) |

## Deviations from SDD (intentional)
- **Both bridge methods (`listSentForThread`, `getSelection`) landed in Phase 1** so the `MailBridge` interface is complete from the start (the fake bridge stubs both); Phase 2 only adds the command.
- **`SelectedMessage` (and `GET_SELECTION_JS`) carry `body` + `attachments`.** The SDD's SelectedMessage was metadata-only; carrying the body lets any-mailbox selections be filed without a fetchBody (which is INBOX-scoped). Cleaner and more robust.
- **`senderAddress` is derived in TS** via `parseSenderAddress` from the raw sender `listInbox` already returns — no `LIST_INBOX_JS` change needed.

## Manual smoke checklist (new osascript methods — no CI gate)
Run against real Apple Mail before relying on the conversation features:
1. **Sent mailbox names:** Settings → LuKit → Detect accounts → confirm the per-account **Sent mailbox** field is populated (Gmail is typically `[Gmail]/Sent Mail`; localized names vary). Fix any that are wrong.
2. **`listSentForThread` (walk):** file a received email you have replied to → the Vorgang section should contain **both** the received message and your Sent reply, in date order. If your reply is missing, the account's Sent mailbox name is likely wrong.
3. **Dedup:** file more of the same thread later into the same Vorgang → only new messages are added (no duplicates).
4. **`getSelection` / single-shot:** select a **Sent** message in Mail → run "E-Mail: File selected Mail message" → pick a Vorgang → it files the thread and **archives nothing**. Confirm direction is detected (Sent recognized).
5. **Cross-session routing:** after filing a few emails, start a new walk → an email from a known correspondent/thread should pin the previously-used Vorgang (from the mined cache), even across Obsidian restarts.

## Notes
- Modal-driven walk/single-shot sequences (picker→preview→advance) are validated by testing the underlying methods + pure engines with a fake `MailBridge`; the live modal UI is manual, consistent with the base feature.
- `listSentForThread` iterates the Sent mailbox checking recipients (recipient lists aren't bulk-readable) — acceptable at occasional file-time; watch for latency on very large Sent mailboxes during the smoke test.
