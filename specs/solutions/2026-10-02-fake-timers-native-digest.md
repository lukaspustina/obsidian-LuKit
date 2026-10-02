# A fake clock cannot advance what resolves outside it

Date: 2026-10-02 · SDD: `specs/done/sdd/office-previews-2026-10-02.md`

**What failed:** driving the office-previews feature under `vi.useFakeTimers()`. A hash started inside `advanceTimersByTimeAsync` never finished there: `crypto.subtle.digest` resolves on a native thread, outside the fake clock, so every debounce → hash → enqueue chain stalled and status counts read 0. Separately, a `setTimeout(fn, 0)` yield was never run by `advanceTimersByTimeAsync(0)` — Node, and the fake clock with it, makes a 0 ms timer due after 1 ms.

**What worked:** the harness stubs `crypto.subtle.digest` with a microtask-resolving `createHash("sha256")` (same digest, restored in `dispose`), and `settle()` advances 1 ms per round. Production keeps the native digest.

**Rule of thumb:** under fake timers, look for any await that resolves through native I/O or a 0 ms timer before blaming the code under test.
