# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-10)

- **Phase 1 (citation-first static site)**: shipped. Cloudflare Pages deploys via the Pages Git integration.
- **Phase 2 P1 eval chain**: shipped (`6tn`, `f3l`, `y97`, `193`).
- **Phase 2 P1 source-gap chain**: shipped today.
  - `owb` — classifier routes `i.redd.it` / `preview.redd.it` to a `reddit-media` stub instead of fetching CAPTCHA HTML.
  - `2pr` — `enrichBatch` now extracts URLs from `selftext` for reddit selfposts and attaches `linkedContentExtras: EnrichedLink[]`. Verified on 3 selfposts in the live `2026-05-04` fixture.
  - `izm` — `pnpm pipeline:scrape:github-releases` ships; `--since` accepts ISO or `Nd` shorthand; `GITHUB_TOKEN` raises rate limits. Discussions split off as **`8gz`** (needs GraphQL).
  - `j22` — `pnpm pipeline:scrape:awesome-neovim` blobless-clones (`--filter=blob:none`) `rockerBOO/awesome-neovim` to `pipeline/.cache/awesome-neovim` and parses additions out of `git log -p -- README.md`. Not a shallow clone — `git log --since` needs full history. Smoke-tested live: 35 additions over the last 30 days.
- **Pipeline-robustness landed**: `1ra` (UA constant lives in `pipeline/src/http.ts`), `4oj` (Zod-validated `RawScrapePayload<T,P>` envelope; `enrich-links` rejects a malformed scrape file with a clear error). Reddit scraper now writes `items` (not `posts`); the live `2026-05-{04,10}` raw fixtures were one-shot migrated.
- **New classifier kind**: `github-release` for `github.com/.../releases[/tag/...]` URLs, so the enricher does not fetch the wrong README. Release notes live in `item.body`.

## Immediate priority — drafter prompt

The four sources (Reddit selfposts + selftext extras, GitHub releases, awesome-neovim) now cover every section header in the launch issue's structure. The drafter prompt — executed by a separate LLM harness project, not code in this repo — is the next gate.

1. **`this-week-in-neovim-qez`** [P1] — write `pipeline/prompts/draft.md`: the prompt the external harness invokes against enriched JSON to produce MDX. Eval still gates output (citations + faithfulness); only the prompt lives here. No new pipeline code.
2. **`this-week-in-neovim-w5b`** [P2] — end-to-end integration test. Now unblocked: it can exercise the real scrape→enrich→eval seam (no LLM call; uses a hand-crafted draft-projection helper).
3. **`this-week-in-neovim-der`** [P2] — Zod-validate the Reddit listing payload (the per-source equivalent of what `4oj` did at the envelope level).
4. **`this-week-in-neovim-1f7`** [P3 bug] — `--date` defaults to today UTC; surprises around the scrape→enrich midnight boundary.

## Source breadth (parallel, lower-coupling)

The launch issue has six section headers; current coverage is plugin-heavy. Filed sources by section:

| Section | Shipped | P2 follow-ups | P3 follow-ups |
|---|---|---|---|
| `## Neovim core` | `izm` (releases) | `8gz` Discussions/RFC (GraphQL) | — |
| `## New plugins` | `j22` (awesome-neovim) | `jzg` GitHub Search cross-validator | — |
| `## Updated plugins` | — | `q94` plugin-author release feeds | — |
| `## Notable posts & videos` | — | `hmn` YouTube channel RSS | `ei7` HN/Lobsters, `40l` dev-blog RSS |
| `## Community` | — | — | `4kv` Mastodon #neovim |
| cross-cutting | `reddit r/neovim` (selfposts + extras) | — | — |

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
bd ready                                         # 15 ready issues today
pnpm pipeline:scrape:reddit --subreddit=neovim --timeframe=week --limit=50
pnpm pipeline:scrape:github-releases --owner=neovim --repo=neovim --since=7d
pnpm pipeline:scrape:awesome-neovim --since=7d
pnpm pipeline:enrich:links --date $(date -u +%Y-%m-%d)
pnpm pipeline:eval:draft content/issues/2026-05-04.mdx --skip-links
```
