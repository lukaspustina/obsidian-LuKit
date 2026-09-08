# Cycle halted: triage-note-stops

**Step**: sdd-verify (its Phase 4a correctness pass)
**Reason**: blocker
**Detail**: preselected rows make a date-only ⌘S confirm take the group over instead of deferring it — the date is silently dropped

## What you must decide

Preselection was load-bearing under the old contract: ⌘S showed one group, every line came
ticked, and confirming meant "take this group over" — which is why the SDD's Decision Log
retired ⌘D-as-take-over in favour of "⌘S + Enter". The multi-group dialog broke that. A confirm
now spans every group of the note, so setting a date on one group also takes over every line of
every sibling, and the dated group is removed rather than deferred (`keepsAnything` is false when
nothing was left unticked, so `snoozeGroup` is skipped by design — the skip rule is right, its
input is not).

The decision is what the dialog's default should be, and it is a product decision, not a
mechanical one: unticked-by-default makes every confirm safe and makes "take the whole group
over" cost one extra gesture; keeping preselection means adding a per-group gate so a group is
only taken over when its own box says so. Either way the SDD's Decision Log row on "⌘S + Enter"
has to change.

Two of the six findings are already fixed and committed separately:
- MAJOR (`otherTasks` attached tasks already completed or skipped today, so ⌘D on such a note
  toggled a recurring instance back OPEN while reporting "erledigt") — fixed with `isOpenToday`.
- The remaining three MINORs (the ⌘./Enter counting gap, the missing height cap on a multi-group
  modal, the unstyled date/discard rows) are open and independent of this decision.

## Resume

`/sdd triage-note-stops --from sdd-implement`

Steps already completed and not re-run: sdd-create, sdd-refine, sdd-validate, sdd-refine.
