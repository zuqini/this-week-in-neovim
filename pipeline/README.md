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

### Reddit (`pipeline/src/sources/reddit/`)

Scrapes top posts (and top comments) from a subreddit via Reddit's public JSON endpoint. Output is an envelope `{ source, subreddit, fetchedAt, params, posts }` where each post is projected to 12 fields (snake_case preserved to match Reddit's API) plus `top_comments[]`.

#### Run

```bash
pnpm pipeline:scrape:reddit -- --subreddit=neovim --timeframe=week --limit=50
```

Flags (all `--key=value`):

| Flag | Default | Notes |
|---|---|---|
| `--subreddit` | `neovim` | bare name, no `r/` prefix |
| `--timeframe` | `week` | one of `day`, `week`, `month` |
| `--limit` | `50` | listing size; Reddit caps at 100 |
| `--out-dir` | `pipeline/data/raw` | date-stamped subdir is created beneath this |
| `--no-comments` | off | skip the per-post comment fetch (fast iteration) |

Writes `<out-dir>/<YYYY-MM-DD>/reddit-<subreddit>.json` (UTC date). Idempotent — re-running the same day overwrites the same file. One stdout line: `wrote N posts → <path>`.

#### Env vars

None today. When the registered Reddit OAuth app is approved (see "Reddit OAuth status" below), `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` will be required.

#### Output schema

```json
{
  "source": "reddit",
  "subreddit": "neovim",
  "fetchedAt": "2026-05-04T12:34:56.789Z",
  "params": { "subreddit": "neovim", "timeframe": "week", "limit": 50, "withComments": true },
  "posts": [
    {
      "title": "Dynamic neovim theme generation with matugen",
      "author": "OkAdhesiveness1951",
      "permalink": "https://www.reddit.com/r/neovim/comments/1sy9bib/dynamic_neovim_theme_generation_with_matugen/",
      "url": "https://v.redd.it/t8u3ztfs1zxg1",
      "is_self": false,
      "selftext": "Neovim dynamic theme here ...",
      "link_flair_text": "Plugin",
      "score": 286,
      "upvote_ratio": 0.99,
      "num_comments": 42,
      "created_utc": 1777399742,
      "id": "1sy9bib",
      "top_comments": [
        { "id": "oiso0af", "author": "Humprdink", "score": 15, "body": "...", "created_utc": 1777408000 }
      ]
    }
  ]
}
```

`permalink` is absolutized to `https://www.reddit.com/...` (load-bearing for the citation system). `top_comments[]` is the top-5-by-score from a depth-1 comment fetch; `kind: "more"` stubs and any non-`t1` items are filtered out. With `--no-comments`, `top_comments` is omitted entirely.

#### ToS posture

- 1 request/second pacing is enforced inside the client (see `client.ts`).
- Identifying `User-Agent` (`this-week-in-neovim/<ver> (<repo url>)`) is load-bearing for unauth access — Reddit will 429 generic UAs.
- Follows Reddit's [API rules](https://github.com/reddit-archive/reddit/wiki/API): no scraping behind auth, respect rate limits, identify yourself.

#### Performance

A standard run does `1 + limit` HTTP calls (one listing + one comments fetch per post): at the default `--limit=50` that's 51 calls, roughly 51 seconds at 1 req/sec. Use `--no-comments` for fast iteration during development — drops to a single HTTP call.

#### Known limits

- Unauthenticated Reddit API has a low rate ceiling and aggressive UA filtering.
- No backfill beyond Reddit's listing window (~1000 posts max regardless of `t=`).
- "more comments" expansion stubs are not followed; only depth-1 comments returned in the first listing are considered.

#### Reddit OAuth status

Reddit OAuth app registered 2026-05-04, currently pending review. Once approved, the unauth client will be swapped for an OAuth `client_credentials` flow (separate issue) that lifts the rate ceiling and removes UA fragility.

#### Note on `pipeline/data/` and traceability

`pipeline/data/` is gitignored (see `.gitignore`). `TASK.md` originally described raw artifacts as "committed for traceability"; that intent is deferred to whenever GH Actions starts running scrapes. During harness-driven development, **whether to commit a given run's raw output is a per-run editorial choice** — manually `git add -f pipeline/data/raw/<date>/reddit-<sub>.json` if you want it in the PR. Don't flip the gitignore default; it would create churn from local scrape runs.

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
