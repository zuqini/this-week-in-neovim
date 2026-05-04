# Outstanding follow-ups

The 31-item list from the original 2026-05-03 architecture + code review has been
worked through. Most items are now closed in code; the remaining items are
either **deferred** with a stated reason (see `.claude/review-decisions.md` for
the full deferral log) or are tracked in beads.

Run `bd ready` for actionable work and `bd list --status=open` for the full
backlog.

## Outstanding (beads)

- `swk` — Precompile MDX bodies to HTML strings at build time.
  Deferred per commit `2842207` until ~20 issues. Watch `next build` wall-time.
- `dr9` — RSS feed `<content:encoded>` with CDATA HTML body.
  Blocked by `swk`.

## Closed by the 2026-05-03 review-fix pass

The two-stage review (architecture-reviewer + bug-finder + structural + design,
then this fix pass) closed the remaining backlog items end-to-end:

- `cuw`, `236`, `v1b`, `bin`, `rcc` (P0 correctness) — landed
- `bjb`, `fns`, `u4a`, `o1p`, `4sy`, `7k6`, `zg9` (P1) — landed
- `61s`, `us0`, `ath`, `c6y`, `r9w`, `nkf`, `adj` (P2) — landed
- `zgn`, `q7d`, `c5r`, `0yp`, `dpe` (P3 page-side), `4zo`, `rex` — landed
- `pi9` — landed (`loadIssueBody` moved to `lib/issues/body.ts`)
- `37z` (`getAllIssues` singleton retirement) — partial; helper consolidation
  shipped, full composition-root retirement deferred. See
  `.claude/review-decisions.md`.
- `k5p` (test helper consolidation) — landed alongside `37z` partial.

## See also

- `.claude/review-decisions.md` — every review finding investigated but not
  fixed, with rationale (consumed by `/review` and `/arch-review`).
