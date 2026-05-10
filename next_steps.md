# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-10)

- **Phase 1 (citation-first static site)**: shipped. Cloudflare Pages deploys via the Pages Git integration.
- **Phase 2 P1 eval chain**: shipped (`6tn`, `f3l`, `y97`, `193`).
- **Phase 2 P1 source-gap chain**: shipped today.
  - `owb` — classifier routes `i.redd.it` / `preview.redd.it` to a `reddit-media` stub instead of fetching CAPTCHA HTML.
  - `2pr` — `enrichBatch` now extracts URLs from `selftext` for reddit selfposts and attaches `linkedContentExtras: EnrichedLink[]`. Verified on 3 selfposts in the live `2026-05-04` fixture.
  - `izm` — `pnpm pipeline:scrape:github-releases` ships; `--since` accepts ISO or `Nd` shorthand; `GITHUB_TOKEN` raises rate limits. Discussions split off as **`8gz`** (needs GraphQL).
  - `j22` — `pnpm pipeline:scrape:awesome-neovim` shallow-clones `rockerBOO/awesome-neovim` to `pipeline/.cache/awesome-neovim` and parses additions out of `git log -p -- README.md`. Smoke-tested live: 35 additions over the last 30 days.
- **Pipeline-robustness landed**: `1ra` (UA constant lives in `pipeline/src/http.ts`), `4oj` (Zod-validated `RawScrapePayload<T,P>` envelope; `enrich-links` rejects a malformed scrape file with a clear error). Reddit scraper now writes `items` (not `posts`); the live `2026-05-{04,10}` raw fixtures were one-shot migrated.
- **New classifier kind**: `github-release` for `github.com/.../releases[/tag/...]` URLs, so the enricher does not fetch the wrong README. Release notes live in `item.body`.

## Immediate priority — start drafting

The four sources (Reddit selfposts + selftext extras, GitHub releases, awesome-neovim) now cover every section header in the launch issue's structure. The drafter is the next gate.

1. **Drafting** (LLM writes MDX from enriched JSON) — not yet filed. The eval harness gates the output; build the prompt + glue. Recommended next bd to file.
2. **`this-week-in-neovim-w5b`** [P2] — end-to-end integration test. Now unblocked: it can exercise the real scrape→enrich→eval seam.
3. **`this-week-in-neovim-der`** [P2] — Zod-validate the Reddit listing payload (the per-source equivalent of what `4oj` did at the envelope level).
4. **`this-week-in-neovim-1f7`** [P3 bug] — `--date` defaults to today UTC; surprises around the scrape→enrich midnight boundary.

## Source breadth (parallel, lower-coupling)

- **`this-week-in-neovim-8gz`** [P2] — neovim/neovim Discussions (RFC category) via GraphQL. Follow-up to `izm`.
- **`this-week-in-neovim-q94`** [P2] — plugin author release feeds (the `## Updated plugins` beat).
- **`this-week-in-neovim-jzg`** [P2] — GitHub Search `topic:neovim-plugin pushed:>last-week`. Cross-validates `j22`.
- **`this-week-in-neovim-ei7`** [P3] — HN Algolia + Lobsters longform article catcher.

## Conventions for the next agent

- **Use bd, not TODO.md / TodoWrite.** This file is the only durable Markdown for forward-looking work; everything else lives in bd.
- **Read `.claude/review-decisions.md` before flagging design issues.** Recurring rejections are documented.
- **`pipeline/` and `app/lib/components/` must stay decoupled.** `lib/citations.ts` is the only shared seam; it is intentionally `import type`-coupled to `lib/issues/schema.ts`.
- **Citations are the editorial contract.** `validateCitations` (lib/citations.ts) is the gate. The pipeline's `evalDraft` composes that with URL liveness and word count; `evaluateFaithfulness` adds LLM judgment on top.
- **Faithfulness eval costs tokens.** `--faithfulness` is opt-in; the system prompt is cached (`cache_control: ephemeral`).
- **Eval can't catch bad source content.** It checks bullet-vs-source faithfulness, not source-content quality. The classifier and enricher are the gates here — see the new `reddit-media` and `github-release` stubs.
- **`RawScrapePayload<T, P>`** in `pipeline/src/types.ts` is the cross-source envelope. New scrapers must emit `{ source, fetchedAt, params, items }`. `enrich-links` will reject anything else.
- **Session close**: per `CLAUDE.md`, work isn't done until `git push` succeeds. `bd dolt push` first, then `git push`.

## Good first commands

```bash
bd ready                                         # 11 ready issues today
pnpm pipeline:scrape:reddit --subreddit=neovim --timeframe=week --limit=50
pnpm pipeline:scrape:github-releases --owner=neovim --repo=neovim --since=7d
pnpm pipeline:scrape:awesome-neovim --since=7d
pnpm pipeline:enrich:links --date $(date -u +%Y-%m-%d)
pnpm pipeline:eval:draft content/issues/2026-05-04.mdx --skip-links
```
