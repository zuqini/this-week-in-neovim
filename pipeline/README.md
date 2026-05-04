# Pipeline

The weekly content pipeline that produces TWiN draft MDX. The pipeline is a set of small CLIs invoked by an LLM drafting harness — not a GH Actions cron job. See `TASK.md` for the architectural overview.

Stages: **scrape → enrich → draft → eval → PR**.

Outputs live under `pipeline/data/` (gitignored):

```
pipeline/data/
  raw/<YYYY-MM-DD>/<source>.json       # one file per scraper
  enriched/<YYYY-MM-DD>/<source>.json  # raw items + linkedContent
```

## Sources

<!-- Reddit-source documentation lands here (see issue s0i). -->

## Enricher (`pipeline/src/enrich/`)

The enricher walks each scraped item's URL and fetches the linked content so the LLM has substance to cite, not just headlines. Source-agnostic: every scraper produces items with URLs and the enricher classifies + dispatches per kind.

### Supported link kinds

| Kind | Source | What we fetch |
|---|---|---|
| `github-readme` | `github.com/{owner}/{repo}` | `raw.githubusercontent.com/.../README.md` (with case-fallback chain), capped at 8 KB |
| `html-article` | generic blog URLs | HTML → `@mozilla/readability` main-content extract → markdown via `turndown`, capped at 8 KB |
| `video` | `v.redd.it`, YouTube, Vimeo | skipped; tagged "video; content unavailable for citation" |
| `reddit-self` | `reddit.com/r/.../comments/...` | skipped; the selftext from the Reddit scraper is already the content |
| `unknown` | non-http(s), malformed URLs | dropped |

Per-item failures don't fail the batch — failed items round-trip with `linkedContent: { kind: "fetch-failed", url, error }`.

### CLI

```bash
pnpm pipeline:enrich:links [-- --date YYYY-MM-DD] [-- --concurrency N]
```

Reads `pipeline/data/raw/<date>/*.json`, writes `pipeline/data/enriched/<date>/<source>.json`. Idempotent: re-runs skip items already enriched (matched by URL). Exits 0 even if some items fail individually; exits 1 only on systemic failure (cannot read input, cannot write output). One summary line on stdout (`enriched N items, skipped M, failed K`); per-failure details on stderr with the URL named.

### Out of scope (deferred)

- Headless browser fallback (Playwright) for JS-heavy pages — fetch + Readability handles ~80% of links today.
- Cross-run caching — weekly cadence makes a cache pointless.
- GitHub API auth — `raw.githubusercontent.com` is public and our volume is well under the unauth rate limit.
