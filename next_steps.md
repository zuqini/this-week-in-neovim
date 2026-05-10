# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-10)

- **Phase 1 (citation-first static site)**: shipped. Next.js 16 `output: "export"`, one MDX issue live (`content/issues/2026-05-04.mdx`), deploys to Cloudflare Pages on push to `main`.
- **Phase 2 P1 chain**: shipped. `6tn` (CI fix), `f3l` (citation validator), `y97` (draft-eval CLI: citations + URL liveness + word count), `193` (LLM-as-judge faithfulness with prompt caching). The harness can now run `pnpm pipeline:eval:draft <mdx> [--faithfulness --enriched-dir <path>]` and gate on the result.
- **Phase 2 remaining**: drafting (LLM writes MDX from enriched JSON) and the PR-open glue. Neither is filed as a P1 yet — see backlog.

## Immediate priority

Pick from `bd ready` — nothing is blocking deploys. Suggested order:

1. **`this-week-in-neovim-w5b`** — End-to-end harness-equivalent integration test. Was blocked on `f3l`; now unblocked. Worth doing before drafting/PR-open lands so the seam stays honest.
2. **`this-week-in-neovim-1ra`** — Move `DEFAULT_USER_AGENT` out of `reddit/client.ts`. Mechanical 30-min refactor; the enrich modules already import it from there awkwardly.
3. **`this-week-in-neovim-4oj`** / **`this-week-in-neovim-der`** — `RawScrapePayload` envelope and Zod-validate Reddit payload. Pipeline robustness.
4. **`this-week-in-neovim-149`** — Cloudflare per-PR preview deploys. Becomes important the moment auto-PRs land.

## P3 backlog

`bd list --status=open --priority=3` — docs (`gmb`/`uvp`), CI canaries (`609`, `8em`), one pipeline papercut (`1f7`).

## Conventions for the next agent

- **Use bd, not TODO.md / TodoWrite.** This file is the only durable Markdown for forward-looking work; everything else lives in bd.
- **Read `.claude/review-decisions.md` before flagging design issues.** Recurring rejections are documented.
- **`pipeline/` and `app/lib/components/` must stay decoupled.** `lib/citations.ts` is the first shared seam — it's intentionally `import type`-coupled to `lib/issues/schema.ts` so the pipeline can import it without dragging in `server-only`.
- **Citations are the editorial contract.** `validateCitations` (lib/citations.ts) is the gate. The pipeline's `evalDraft` composes that with URL liveness and word count; `evaluateFaithfulness` adds LLM judgment on top.
- **Faithfulness eval costs tokens.** `--faithfulness` is opt-in for that reason. The system prompt is cached (`cache_control: ephemeral`) so per-bullet input cost stays low — verify cache hit rates via the stderr usage line if costs spike.
- **Session close**: per `CLAUDE.md`, work isn't done until `git push` succeeds. `bd dolt push` first, then `git push`.

## Good first commands

```bash
bd ready                        # what's unblocked right now
bd show this-week-in-neovim-w5b # head of the post-P1 priority list
pnpm pipeline:eval:draft content/issues/2026-05-04.mdx --skip-links
                                # smoke the eval CLI (works offline)
```
