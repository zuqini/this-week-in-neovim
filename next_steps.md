# Next steps

Compass for the next agent. **bd is the source of truth** — this file points; the issues describe.

## Status (2026-05-10)

- **Phase 1 (site)** and **Phase 2 P1 (eval chain, source-gap chain, drafter prompt, first drafter run)**: shipped. `pipeline/data/drafts/2026-05-04.draft.mdx` passes citations / links / word-count; `--faithfulness` not yet run.
- **Eval-contract widening** (`n53` / `8bo` / `jr5`, shipped 2026-05-10): `loadSourceContent` now indexes top-level `linkedContent.content`, github-release `item.body`, Reddit `selftext` (keyed by `permalink`), and `linkedContentExtras[i].content`. Citable ceiling on the 2026-05-04 fixture: 5 → ~46. Prompt at `pipeline/prompts/draft.md` rewritten to match.

## Immediate priority — paid `--faithfulness` baseline on a fresh re-draft

Re-draft 2026-05-04 against the updated prompt and run `--faithfulness` on the result. Don't baseline the existing 2026-05-10 draft — it was written against the narrow contract and would measure a near-dead branch. The new draft should begin populating `## Updated plugins`, `## Notable posts & videos`, and `## Community`.

```bash
ANTHROPIC_API_KEY=… pnpm pipeline:eval:draft \
  pipeline/data/drafts/2026-05-04.draft.mdx \
  --faithfulness \
  --enriched-dir pipeline/data/enriched/2026-05-04
```

Known loss: `v.redd.it` videos — no transcript, no related-URL extraction. Revisit only if they keep topping the week.

## Source breadth (parallel, lower-coupling)

| Section | Shipped | P2 follow-ups | P3 follow-ups |
|---|---|---|---|
| `## Neovim core` | `izm` (releases) | `8gz` Discussions/RFC | — |
| `## New plugins` | `j22` (awesome-neovim) | `jzg` GitHub Search cross-validator | — |
| `## Updated plugins` | — | `q94` plugin-author release feeds | — |
| `## Notable posts & videos` | — | `hmn` YouTube channel RSS | `ei7` HN/Lobsters, `40l` dev-blog RSS |
| `## Community` | — | — | `4kv` Mastodon #neovim |
| cross-cutting | reddit r/neovim (selfposts + extras) | — | — |

## Conventions

- **Read `.claude/review-decisions.md` before flagging design issues.** Recurring rejections are documented there.
- **`pipeline/` ↔ `app/lib/components/` stay decoupled.** `lib/citations.ts` is the only shared seam (intentionally `import type`-coupled to `lib/issues/schema.ts`).
- **`RawScrapePayload<T, P>`** in `pipeline/src/types.ts` is the cross-source envelope. New scrapers emit `{ source, fetchedAt, params, items }`; `enrich-links` rejects anything else.
- **Eval can't catch bad source content.** It checks bullet-vs-source faithfulness, not whether the source is worth citing. Classifier and enricher are the gates there.

## Good first commands

```bash
bd ready
pnpm pipeline:scrape:reddit --subreddit=neovim --timeframe=week --limit=50
pnpm pipeline:scrape:github-releases --owner=neovim --repo=neovim --since=7d
pnpm pipeline:scrape:awesome-neovim --since=7d
pnpm pipeline:enrich:links                       # --date defaults to most recent raw subdir
pnpm pipeline:eval:draft content/issues/2026-05-04.mdx --skip-links
```
