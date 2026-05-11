# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-10)

- **Phase 1 (citation-first static site)**: shipped. Cloudflare Pages deploys via the Pages Git integration.
- **Phase 2 P1 eval chain**: shipped (`6tn`, `f3l`, `y97`, `193`).
- **Phase 2 P1 source-gap chain**: shipped (`owb`, `2pr`, `izm`, `j22`, `1ra`, `4oj`).
- **Drafter prompt** (`qez`): shipped at `pipeline/prompts/draft.md`. Self-contained; the external LLM harness substitutes `{{ISSUE_NUMBER}}`, `{{DATE}}`, `{{ENRICHED_JSON}}` and emits MDX.
- **First drafter run** (`acz`): done 2026-05-10. An LLM drafter walked the 2026-05-04 fixture and emitted MDX at `pipeline/data/drafts/2026-05-04.draft.mdx`. `pnpm pipeline:eval:draft` passes all non-LLM checks: citations OK, 219 words in `[100, 10000]`, all 5 link HEADs return 2xx.
- **Eval-contract widening** (`n53`, `8bo`, `jr5`): shipped 2026-05-10. `loadSourceContent` in `pipeline/bin/eval-draft.ts` now indexes four shapes of source text: top-level `linkedContent.content`, github-release `item.body`, Reddit self-post `selftext` keyed by `permalink`, and `linkedContentExtras[i].content` keyed by each extra's URL. The drafter prompt's faithfulness section is rewritten to match. Regression tests live in `tests/pipeline/eval-draft.test.ts`. The 2026-05-04 fixture's ceiling jumps from 5 citable items to (5 + 38 self-posts + 3 plugin-announcement READMEs) = ~46 citable items.

## Immediate priority — paid `--faithfulness` baseline on the next drafter run

The eval-contract gap is closed; the next concrete step is the LLM judge that the previous run deferred. Two options for the baseline pass:

1. **Re-run the existing 2026-05-04 fixture** through `--faithfulness`. Cheap (~5 calls), measures the *old* prompt against the *new* contract. Useful as a regression-free sanity check before drafting on a wider corpus.
2. **Re-draft 2026-05-04** with the updated prompt and the wider source pool, then run `--faithfulness`. Costs more (~20–50 calls depending on how much the drafter uses), but it measures the version of the system that will actually ship.

Recommend (2): the prompt has changed enough that (1) would baseline a near-dead branch. The first new draft should also start populating the missing sections (`## Updated plugins`, `## Notable posts & videos`, `## Community`).

```bash
ANTHROPIC_API_KEY=… pnpm pipeline:eval:draft \
  pipeline/data/drafts/2026-05-04.draft.mdx \
  --faithfulness \
  --enriched-dir pipeline/data/enriched/2026-05-04
```

Videos (`v.redd.it`) remain a separate problem — no transcript, no related-URL extraction. Live with the loss for now; revisit if videos keep dominating top scores.

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
pnpm pipeline:enrich:links                       # --date defaults to most recent raw subdir (1f7)
pnpm pipeline:eval:draft content/issues/2026-05-04.mdx --skip-links
```
