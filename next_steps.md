# Next steps

Compass for the next agent picking up this project. **bd is the source of truth** — this file points; the issues describe.

## Where things stand (2026-05-11)

- **Phase 1 (citation-first static site)**: shipped. Cloudflare Pages deploys via the Pages Git integration.
- **Phase 2 P1 eval chain**: shipped (`6tn`, `f3l`, `y97`, `193`).
- **Phase 2 P1 source-gap chain**: shipped (`owb`, `2pr`, `izm`, `j22`, `1ra`, `4oj`).
- **Drafter prompt** (`qez`): shipped at `pipeline/prompts/draft.md`. Self-contained; the external LLM harness substitutes `{{ISSUE_NUMBER}}`, `{{DATE}}`, `{{ENRICHED_JSON}}` and emits MDX. The prompt is opinionated about the faithfulness-judge constraint — only top-level items with `linkedContent.content` (kinds `github-readme` / `html-article`) are safe to cite, because `loadSourceContent` in `pipeline/bin/eval-draft.ts` only reads top-level `item.linkedContent.content` (not `selftext`, not `body`, not `linkedContentExtras`).
- **First drafter run** (`acz`): done 2026-05-10. An LLM drafter walked the 2026-05-04 fixture and emitted MDX at `pipeline/data/drafts/2026-05-04.draft.mdx`. `pnpm pipeline:eval:draft` passes all non-LLM checks: citations OK, 219 words in `[100, 10000]`, all 5 link HEADs return 2xx. The `--faithfulness` judge has not been run yet (token cost).

## Immediate priority — close the eval-contract gap that swallowed the week

`acz` confirmed the prompt produces eval-clean MDX (citations, links, word count) but also exposed how little of the corpus the drafter can see. From the 2026-05-04 reddit-only fixture:

- 50 items scraped and enriched, 5 citable. The other 45 break down as 38 `reddit-self`, 7 `video`.
- The dropped items include the **top 6 posts of the week by score**: matugen theme (287), godbolt-at-home (234), thorn.nvim (140), git-conflict plugin (105), treesitter discussion (97), and a meta thread on GitHub issue comments (81). All present in `pipeline/data/enriched/2026-05-04/reddit-neovim.json`, none citable.
- Three Plugin-flair self-posts (lazydiff.nvim, godot-scenetree.nvim, nvim-appimage) have a fetched `github-readme` in `linkedContentExtras` — the enricher pulled it specifically to enable citation — but `loadSourceContent` only indexes top-level `item.url`, so the extras are dead weight.

The enrichment pipeline did its job; the eval-contract is the bottleneck. Three filed fixes, in order:

1. **`n53`** — `loadSourceContent` walks `linkedContentExtras` and keys URL→text by every extra's URL. Highest ROI: unlocks 3 Plugin announcements per week from r/neovim alone, including the `lazydiff.nvim` example the drafter prompt teaches voice with.
2. **`8bo`** — `loadSourceContent` indexes `item.selftext` keyed by `permalink` for Reddit self-posts. Unlocks ~30 substantive self-posts per week (thorn.nvim's 1115-char announcement, the 3511-char statuscolumn writeup, etc.). Depends on `n53` for the prompt-update pattern.
3. **`jr5`** — `loadSourceContent` reads `item.body` for `github-release` items. Required before `izm`-shaped release data is useful to the drafter.

Each one needs a matching update to `pipeline/prompts/draft.md` flipping the corresponding "avoid X as citation" guidance.

Deferred (but still real): a paid `--faithfulness` baseline on the existing 5-bullet draft. Cheap (~5 LLM calls), measures the prompt rather than the contract — do it after the contract is fixed so we're measuring the version we'll actually ship.

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
