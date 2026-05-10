# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-10)

- **Phase 1 (citation-first static site)**: shipped. Next.js 16 `output: "export"`, one MDX issue live (`content/issues/2026-05-04.mdx`). Cloudflare Pages deploys via the **Pages Git integration** (not the GH Actions wrangler step — that's gone). Framework preset is **None**, build `pnpm run build`, output dir `out`. Pushes to `main` deploy to production; PRs get preview URLs automatically.
- **Phase 2 P1 chain (eval)**: shipped. `6tn` (CI fix), `f3l` (citation validator), `y97` (draft-eval CLI: citations + URL liveness + word count), `193` (LLM-as-judge faithfulness with prompt caching). The harness can run `pnpm pipeline:eval:draft <mdx> [--faithfulness --enriched-dir <path>]` and gate on the result.
- **Live pipeline run** (2026-05-10): scrape and enrich both work end-to-end. Surfaced two real problems — see the priority list. Existing live fixtures sit at `pipeline/data/{raw,enriched}/2026-05-{04,10}/` (gitignored).

## Immediate priority — close source gaps before drafting

The pipeline is structurally sound but **r/neovim alone doesn't yield enough quality content for a publishable issue**. ~15 bullets/week, all skewed to "I made a plugin/theme," and three section headers with nothing to fill them. Land these P1s before attempting issue #2:

1. **`this-week-in-neovim-owb`** [bug] — Classifier misroutes `i.redd.it`/`preview.redd.it` images into `html-article`, so the enricher stores a Reddit CAPTCHA page as if it were source content. Eval can't catch it. Fix first; trivial.
2. **`this-week-in-neovim-2pr`** — Extract URLs from selfpost bodies and enrich them. Biggest content multiplier currently identified — turns 287-upvote plugin announcements from a one-line summary into a substantive bullet. Same posts, much richer source material.
3. **`this-week-in-neovim-izm`** — `neovim/neovim` releases + RFC discussions. Without this, `## Neovim core` has no scraped data behind it.
4. **`this-week-in-neovim-j22`** — `awesome-neovim` README diff over last 7 days. Without this, `## New plugins` has no source.

After 1-4 land, the seam is testable end-to-end. Then:

5. **`this-week-in-neovim-w5b`** — integration test. Becomes valuable once the source set above is in place.
6. **`this-week-in-neovim-q94`** [P2] — plugin author release feeds for `## Updated plugins`.
7. **`this-week-in-neovim-jzg`** [P2] — GitHub Search broader plugin sweep, cross-validates `j22`.
8. **`this-week-in-neovim-ei7`** [P3] — HN Algolia + Lobsters longform article catcher.

## Pipeline-robustness cluster (in parallel, low coupling)

- **`this-week-in-neovim-1ra`** — Move `DEFAULT_USER_AGENT` out of `reddit/client.ts`. 30-min mechanical refactor; the enrich modules already import it from there awkwardly. Worth doing before adding more sources (`izm`/`j22`/`jzg`/`q94`) so each new client doesn't reinvent the same UA constant.
- **`this-week-in-neovim-4oj`** — `RawScrapePayload` shared envelope. Same reasoning — defining the envelope before the third source lands keeps the new scrapers from drifting.
- **`this-week-in-neovim-der`** — Zod-validate the Reddit listing payload.

## Not yet filed but on the radar

- **Drafting** (LLM writes MDX from enriched JSON) and **PR-open glue**. Neither has a P1 yet. Do not start drafting until the source set above produces content for every section header — otherwise the LLM is asked to invent.
- **Mastodon/Bluesky neovim hashtag** — community-mood signal. Low priority.

## Conventions for the next agent

- **Use bd, not TODO.md / TodoWrite.** This file is the only durable Markdown for forward-looking work; everything else lives in bd.
- **Read `.claude/review-decisions.md` before flagging design issues.** Recurring rejections are documented.
- **`pipeline/` and `app/lib/components/` must stay decoupled.** `lib/citations.ts` is the first shared seam — it's intentionally `import type`-coupled to `lib/issues/schema.ts` so the pipeline can import it without dragging in `server-only`.
- **Citations are the editorial contract.** `validateCitations` (lib/citations.ts) is the gate. The pipeline's `evalDraft` composes that with URL liveness and word count; `evaluateFaithfulness` adds LLM judgment on top.
- **Faithfulness eval costs tokens.** `--faithfulness` is opt-in for that reason. The system prompt is cached (`cache_control: ephemeral`) so per-bullet input cost stays low — verify cache hit rates via the stderr usage line if costs spike.
- **Eval can't catch bad source content.** It checks bullet-vs-source faithfulness, not source-content quality. CAPTCHA pages, image-blob URLs, and other scraping garbage still pass. The classifier and enricher are the gates here.
- **Session close**: per `CLAUDE.md`, work isn't done until `git push` succeeds. `bd dolt push` first, then `git push`.

## Good first commands

```bash
bd ready                        # what's unblocked right now (16 issues today)
bd show this-week-in-neovim-owb # the classifier bug — fix first
bd show this-week-in-neovim-2pr # biggest content multiplier
pnpm pipeline:scrape:reddit --subreddit=neovim --timeframe=day --limit=10 --no-comments
pnpm pipeline:enrich:links --date=$(date -u +%Y-%m-%d)
                                # smoke the live pipeline
pnpm pipeline:eval:draft content/issues/2026-05-04.mdx --skip-links
                                # smoke the eval CLI (works offline)
```
