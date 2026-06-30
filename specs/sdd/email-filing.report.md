# SDD Implementation Report: email-filing.md

**Date**: 2026-06-30
**Phases run**: 1, 2, 3, 4 (all)
**Overall status**: all-shipped (Phase 3 bridge code-complete; live Mail smoke test pending)
**Branch**: `feat/email-filing` (off `master`)

| Phase | Title | Status | Commit |
|-------|-------|--------|--------|
| 1 | Pure email engines | shipped | 997787b |
| 2 | Shared reuse extensions | shipped | 917f1ec |
| 3 | Mail bridge (osascript/JXA) | shipped (manual smoke pending) | 114739b |
| 4 | Feature, preview modal, settings, wiring | shipped | f351149 |

(SDD committed at 4582bc0.) Full suite: **429 tests pass**; `npm run build` (tsc + esbuild plugin + cli) clean.

## Phase 3 — Mail bridge

**Status**: shipped (no CI gate by design) · **Commit**: 114739b

`src/features/email-filing/mail-bridge.ts`: `createOsascriptBridge` with `listInbox`,
`listAccounts`, `fetchBody`, `archive`, `isInInbox` over `osascript -l JavaScript` via
`child_process.execFile`. All runtime values are passed as **trailing argv** (read by the
JXA `run(argv)` handler) — never interpolated into the script source. `'child_process'`
added to the plugin bundle's esbuild `external`. TCC denial (-1743) surfaces a readable
German error. `tests/unit/mail-bridge.test.ts` (4) verifies the argv-safety contract,
per-account mailbox resolution, and the TCC error path by mocking `child_process`.

**Not verifiable here (your gate):** the JXA Mail object-model calls (`Mail.inbox.messages()`,
`mailbox().account()`, `mailboxes.byName(...)`, `Mail.move`, attachment props) are
best-effort and require a live smoke test against your real accounts. See the smoke
checklist below. The `run(argv)` handler is used instead of `$.NSProcessInfo.processInfo.arguments`
(same no-interpolation security property; cleaner — trailing args only).

## Phase 4 — Feature, preview modal, settings, wiring

**Status**: shipped · **Commit**: f351149

`email-filing-feature.ts` (`EmailFilingFeature`), `email-preview-modal.ts`
(`EmailPreviewModal`), `email-filing-settings.ts` (`EmailFilingSettings` +
`mergeDetectedAccounts`); `src/types.ts` (`emailFiling` + explicit `mergeSettings`
spread), `src/main.ts` (registration), `tests/helpers/obsidian-mocks.ts`
(`makeTestSettings` emailFiling override). Docs: README/CLAUDE/TODO.

### Acceptance Criteria
| Criterion | Status |
|-----------|--------|
| Pick → archive → verify → modify Vorgang | passing (`fileEmailIntoVorgang`) |
| archive throws → no modify, Notice w/ subject + message:// | passing |
| isInInbox true → no modify, error Notice | passing |
| vault.modify fails → partial-state Notice | passing |
| Don't-file → archive only | passing |
| order newest reverses | passing |
| concurrent-walk guard | passing |
| empty inbox → Notice | passing |
| open message:// via injected opener | passing |
| Detect-accounts merge (Req 23) | passing (`mergeDetectedAccounts`) |
| Skip / Stop+open / advance modal wiring | **manual** (stub modals are no-ops — same boundary as Besprechung's untested modal wiring) |
| EmailPreviewModal edit→onConfirm | **manual** (needs real DOM; stub has none) |

### Deviations / notes
- `EmailPreviewModal` cancel during the walk advances to the next message without archiving (SDD did not specify walk-level preview-cancel behavior; safest no-side-effect choice).
- Modal-driven scenarios (Skip/Stop/advance, preview edit→confirm) are not CI-tested because the vitest "obsidian" stub's modals are no-ops; this matches how the existing Besprechung feature's modal interactions are left to manual testing.

## Manual Smoke Checklist (Phase 3 — run against real Apple Mail before relying on the feature)

1. Grant Automation: first run triggers a macOS prompt to let Obsidian control Mail. Approve it (System Settings → Privacy → Automation). Denial → German -1743 Notice.
2. **Detect accounts** (Settings → LuKit → E-Mail-Ablage): button populates one mailbox field per account. Set each account's archive mailbox (iCloud/IMAP: `Archive`; Gmail: try `[Gmail]/All Mail`, fall back to whatever drains the inbox).
3. **Drain test (per account, esp. Gmail):** run "E-Mail: File inbox emails", Don't-file one message → confirm it leaves the inbox in Mail. If a Gmail message does NOT leave the inbox, no mailbox-move drains it → implement the Phase 3b "remove Inbox label" path.
4. **Link test:** file a message, open the resulting `- siehe [E-Mail von …](message://…)` link in the Vorgang → it should open the archived original. If not, `buildMessageUrl` may need the `%3C…%3E` angle-bracket form (the LaunchBar applescripts use it).
5. **Full file:** pick a Vorgang, edit the preview body, confirm → message archived AND an h5 section appears in the Vorgang with the link + body (+ `Anhänge:` if any).

## How to extend / fix

- If Gmail (or any provider) doesn't drain via mailbox-move: add a provider-specific archive path in `mail-bridge.ts` (Phase 3b). The generic `MailBridge` contract and the feature stay unchanged.
- If `message://` links don't resolve: adjust `buildMessageUrl` in `email-format-engine.ts` (single source; unit-tested).
- Resume tooling: the SDD remains at `specs/sdd/email-filing.md` (Status: Ready for Implementation).
