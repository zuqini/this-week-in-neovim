# Next step: hand off the Reddit pipeline to an implementer

This file briefs an implementer agent on the Reddit scraping pipeline work
designed in conversation on 2026-05-04. The bd issues are the contract; this
file is the launch instructions.

## Pre-handoff (do this once before spawning the implementer)

1. Commit the TASK.md edit that captures the architectural shift to
   harness-invoked CLIs (no GH Actions cron for the weekly pipeline).
2. Optionally copy the empirical fixtures from `/tmp/` into the repo so the
   implementer doesn't re-fetch:
   ```bash
   mkdir -p tests/fixtures/reddit
   cp /tmp/reddit-week-50.json tests/fixtures/reddit/listing-top-week.json
   cp /tmp/reddit-comments-matugen.json tests/fixtures/reddit/comments-matugen.json
   ```
   If you skip this, the implementer will re-fetch from Reddit (fine, just
   slower and slightly less reproducible).

## Implementer prompt

Spawn with `subagent_type: implementer`. Paste the block below verbatim.

---

```
Implement the Reddit scraping pipeline. The bd issues ARE the contract — they
contain detailed scope, acceptance criteria, design notes, and "## Notes"
sections that capture decisions made in conversation. Read them in full before
starting; don't paraphrase the scope.

## Issues, in order

1. `bd show this-week-in-neovim-d77` — Reddit HTTP client (unauth + identifying
   UA). READY. Start here.
2. `bd show this-week-in-neovim-ds3` — Link-content enricher (GitHub README +
   HTML readability). READY. Can run in parallel with d77 (different files).
3. `bd show this-week-in-neovim-s0i` — Reddit scrape orchestrator + projection
   helper + CLI + README. BLOCKED by d77; do third.

Deferred for later (do NOT touch): `bd show this-week-in-neovim-0vb` (OAuth
migration — blocked on Reddit app approval).

## Workflow per issue

1. `bd update <id> --claim` to mark in_progress.
2. Read the issue's description, acceptance criteria, design AND notes
   sections. The notes capture later decisions that override earlier scope
   (e.g., d77's notes reverse an earlier "drop comments" decision —
   comments are IN scope).
3. Implement, including tests. The acceptance criteria are the gate.
4. Run `pnpm typecheck && pnpm test` — both must pass.
5. `bd close <id>`.
6. `git add` the new files, commit with a message naming the bd id.

## Project context

- See TASK.md for the broader pipeline architecture (scraper → enricher →
  LLM harness drafts MDX). The pipeline is invoked by an LLM harness, NOT a
  GH Actions cron — design CLIs accordingly (clean stdout, actionable
  stderr, proper exit codes, idempotent re-runs).
- See CLAUDE.md and AGENTS.md for project conventions.
- See .claude/review-decisions.md for accepted tradeoffs reviewers should
  not re-flag.
- Conventions: strict TS, ESM, target ES2022. Vitest. No comments in code
  unless logic is non-obvious. snake_case preserved in the Reddit projection
  (matches Reddit docs).

## Empirical findings (load-bearing, established in design conversation)

- Reddit unauth `top.json` returns 403 with default curl UA but 200 with an
  identifying UA. The UA "this-week-in-neovim/0.1 (https://github.com/...)"
  is mandatory, not polite. Tests must assert it.
- Reddit comments (top-level, depth=1, top 5 by score per post) carry
  first-class signal for discussion / tips / plugin-feedback posts. They
  are IN scope — do not skip.
- Sample fixtures from prior research (use these for tests if present):
    tests/fixtures/reddit/listing-top-week.json
    tests/fixtures/reddit/comments-matugen.json
  If they aren't there, fetch them yourself with the identifying UA above.

## Quality gates

- `pnpm typecheck` clean.
- `pnpm test` clean (no skipped tests on the new code).
- No new direct-runtime deps; tsx is devDep only.
- `pipeline/data/` stays gitignored.
- Commit messages name the bd id (e.g., "d77: reddit http client with
  identifying UA + retry").

When all three issues are closed, run `bd preflight` to surface any lint /
stale / orphan issues, then push:
  git push && bd dolt push
```

---

## Parallelization option

`d77` and `ds3` are independent (different files, different concerns). To
run them concurrently, spawn two implementer agents in a single message,
each pointed at one issue. Then run a third implementer for `s0i` once `d77`
lands.

If you'd rather keep it simple, one implementer working through all three
sequentially is fine — total work is roughly half a day either way.

## Watch-outs

- The `## Notes` section in `d77` REVERSES an earlier "drop comments"
  decision in the body. Make sure the implementer reads notes, not just the
  description. (The prompt above flags this explicitly.)
- The `## Notes` section in `s0i` and `ds3` adds LLM-harness ergonomics
  (clean stdout, idempotent re-runs, etc.) that aren't in the body. Same
  flag — read notes.
- The `s0i` issue includes a "Conflicts to flag" callout about
  `.gitignore:20` excluding `pipeline/data/` while older TASK.md text said
  to commit raw artifacts. The TASK.md edit on 2026-05-04 resolves this in
  favor of keeping the gitignore (per-run editorial choice on what to
  commit). If the implementer raises it as a question, the answer is
  "leave the gitignore alone."
