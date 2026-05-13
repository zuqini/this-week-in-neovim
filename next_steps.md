# Next steps

Compass for the next agent. **bd is the source of truth** — this file points; the issues describe.

## Immediate — paid `--faithfulness` baseline on 2026-05-04

The eval-contract widening (`n53`/`8bo`/`jr5`, 2026-05-10) raised the 2026-05-04 fixture's citable ceiling from 5 to ~46. The existing `pipeline/data/drafts/2026-05-04.draft.mdx` was written against the narrow contract and is a near-dead branch.

**You are the drafter.** No in-repo CLI — per `qez`, the harness lives outside this repo. Read `pipeline/prompts/draft.md` + `pipeline/data/enriched/2026-05-04/*.json`, emit a fresh `pipeline/data/drafts/2026-05-04.draft.mdx`, then:

```bash
ANTHROPIC_API_KEY=… pnpm pipeline:eval:draft \
  pipeline/data/drafts/2026-05-04.draft.mdx \
  --faithfulness --enriched-dir pipeline/data/enriched/2026-05-04
```

`v.redd.it` videos have no transcript and won't be citable; revisit only if they keep topping the week.

## Source breadth (parallel, lower-coupling)

| Section | Shipped | P2 | P3 |
|---|---|---|---|
| `## Neovim core` | `izm` releases | `8gz` Discussions/RFC | — |
| `## New plugins` | `j22` awesome-neovim | `jzg` GitHub Search | — |
| `## Updated plugins` | — | `q94` plugin-author release feeds | — |
| `## Notable posts & videos` | — | `hmn` YouTube RSS | `ei7` HN/Lobsters, `40l` dev-blog RSS |
| `## Community` | — | — | `4kv` Mastodon #neovim |
| cross-cutting | reddit r/neovim | — | — |

## Conventions

- Read `.claude/review-decisions.md` first — accepted tradeoffs not to re-flag.
- `pipeline/` ↔ `app/lib/` decoupled; `lib/citations.ts` is the shared seam.
- New scrapers emit `RawScrapePayload<T, P>` (`pipeline/src/types.ts`).
- Eval checks bullet-vs-source faithfulness, not whether the source is worth citing.
