# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-11)

- **Phase 1 (citation-first static site)**: shipped. Cloudflare Pages deploys via the Pages Git integration.
- **Phase 2 P1 eval chain**: shipped (`6tn`, `f3l`, `y97`, `193`).
- **Phase 2 P1 source-gap chain**: shipped (`owb`, `2pr`, `izm`, `j22`, `1ra`, `4oj`).
- **Drafter prompt** (`qez`): shipped at `pipeline/prompts/draft.md`. Self-contained; the external LLM harness substitutes `{{ISSUE_NUMBER}}`, `{{DATE}}`, `{{ENRICHED_JSON}}` and emits MDX. The prompt is opinionated about the faithfulness-judge constraint — only top-level items with `linkedContent.content` (kinds `github-readme` / `html-article`) are safe to cite, because `loadSourceContent` in `pipeline/bin/eval-draft.ts` only reads top-level `item.linkedContent.content` (not `selftext`, not `body`, not `linkedContentExtras`).

## Known faithfulness-eval gap (worth filing if it bites)

The faithfulness judge can't verify claims cited to:

- `github-release` items (release notes are in `item.body`, judge reads `linkedContent.content`),
- `reddit-self` items (selftext is in `item.selftext`, same reason),
- `linkedContentExtras[i].url` (judge only matches top-level `item.url`).

The drafter prompt works around this by telling the LLM to avoid those as citations. Closing the gap means teaching `loadSourceContent` to read `item.body`, `item.selftext`, and walk extras — and re-keying the URL→text map by every URL the source actually exposes (e.g. permalink AND any extras' URLs). Not filed yet — wait for the first real harness run to confirm the workaround is acceptable before adding code.

## Immediate priority — first real drafter run

1. **`this-week-in-neovim-w5b`** [P2] — end-to-end integration test. Now unblocked: it can exercise the real scrape→enrich→eval seam (no LLM call; uses a hand-crafted draft-projection helper).
2. **`this-week-in-neovim-der`** [P2] — Zod-validate the Reddit listing payload (the per-source equivalent of what `4oj` did at the envelope level).
3. **`this-week-in-neovim-1f7`** [P3 bug] — `--date` defaults to today UTC; surprises around the scrape→enrich midnight boundary.

The unmeasured-but-load-bearing next step is **actually running the prompt against the 2026-05-04 fixture in the external harness** and watching what eval says. The prompt's claims about which sources are citable are derived by reading the eval code — they're correct in theory; one real run will confirm in practice.

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
