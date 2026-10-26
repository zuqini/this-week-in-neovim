# Pipeline

The weekly content pipeline that produces TWiN draft MDX. The pipeline is a set of small CLIs invoked by an LLM drafting harness — not a GH Actions cron job. See `TASK.md` for the architectural overview.

Stages: **scrape → enrich → draft → eval → PR**.

Outputs live under `pipeline/data/` (gitignored):

```
pipeline/data/
  raw/<YYYY-MM-DD>/<source>.json       # one file per scraper
  enriched/<YYYY-MM-DD>/<source>.json  # raw items + linkedContent
  runs/<YYYY-MM-DD>.json               # pipeline:week run summary
```

## Weekly run (`pipeline:week`)

```bash
pnpm pipeline:week [--data-dir=<dir>]
```

One entry point for the scrape + enrich stages. `--data-dir` defaults to `pipeline/data`; there are no other flags. `D` is the UTC date when the run starts. The steps run in-process, one after another:

| Step | Call | Expected output |
|---|---|---|
| `github-releases` | `scrape-github-releases --out-dir=<data>/raw --out-name=github-neovim-neovim-releases.json` | `raw/<D>/github-neovim-neovim-releases.json` |
| `awesome-neovim` | `scrape-awesome-neovim --out-dir=<data>/raw --out-name=awesome-neovim-additions.json` | `raw/<D>/awesome-neovim-additions.json` |
| `reddit` | `scrape-reddit --subreddit=neovim --limit=25 --cdp-url --out-dir=<data>/raw` | `raw/<D>/reddit-neovim.json` |
| `enrich` | `enrich-links --date <D> --root <data>` | `enriched/<D>/` |

A failing scraper doesn't stop the run; enrich always runs over whatever landed in `raw/<D>/`. A scraper that exits 0 counts as failed if the file at its expected path is missing (`expected output … not found`) or older than the step's start (`… predates this run (stale same-day file …)`): the scrapers stamp their own UTC date when they write, so a midnight rollover sends the output elsewhere. `week` passes each output name explicitly (Reddit has no `--out-name`, so it pins `--subreddit` instead). A step that throws counts as exit 1, keeping whatever it printed before the throw. Each step's stdout/stderr still streams to the terminal.

The summary goes to `<data>/runs/<D>.json`, outside `raw/<D>/` and `enriched/<D>/` because enrich and eval read every `*.json` in those:

```json
{
  "date": "2026-11-02",
  "startedAt": "2026-11-02T06:00:00.000Z",
  "finishedAt": "2026-11-02T06:01:10.000Z",
  "ok": false,
  "steps": [
    { "name": "reddit", "ok": false, "exitCode": 1, "durationMs": 1200, "summary": null,
      "error": "scrape-reddit: Reddit request failed: 403 …\nscrape-reddit: hint: …" }
  ],
  "rawFiles": ["awesome-neovim-additions.json", "github-neovim-neovim-releases.json"]
}
```

`summary` is the step's last non-empty stdout line (or `null`); `error` appears only on failed steps and holds the last ≤20 non-empty stderr lines (a throwing step's ends with `threw: <message>`). `rawFiles` lists `raw/<D>/` after the run, so a stale file from an earlier same-day run shows up. One stdout line at the end:

```
pipeline:week 2026-11-02: ok github-releases, awesome-neovim, enrich; FAILED reddit → pipeline/data/runs/2026-11-02.json
```

Exit codes: `0` every step ok; `2` one or more scrapers failed but enrich succeeded; `1` enrich failed (including "no .json files" when every scraper failed), a bad argument, or the summary couldn't be written.

## Sources

### Reddit (`pipeline/src/sources/reddit/`)

Scrapes top posts (and top comments) from a subreddit via Reddit's `.json` endpoints, fetched from inside a signed-in Chrome profile (Reddit has returned 403 for logged-out `.json` requests since ~2026-05-30). Output is the shared `RawScrapePayload` envelope `{ source, fetchedAt, params, items }` (see `pipeline/src/types.ts`) where each item is a post projected to 12 fields (snake_case preserved to match Reddit's API) plus `top_comments[]`.

#### Run

One-time setup — launch the dedicated profile and sign into Reddit in the window that opens:

```bash
pnpm pipeline:chrome    # Chrome with its own profile (~/.config/twin-chrome) + CDP on 127.0.0.1:9222
```

Chrome 136+ ignores `--remote-debugging-port` on the default profile, hence the separate one. The profile keeps its cookies, so later runs only need the window running. Override with `TWIN_CDP_PORT`, `TWIN_CHROME_PROFILE`, or `CHROME` (binary path).

Weekly run, with that Chrome open:

```bash
pnpm pipeline:scrape:reddit -- --cdp-url --subreddit=neovim --timeframe=week --limit=25
```

The scraper attaches over CDP, opens one tab on `reddit.com/robots.txt` (a static same-origin page; a non-2xx or off-origin landing fails the run), issues same-origin `fetch`es with the profile's session (30 s deadline each), then closes that tab and disconnects — Chrome itself keeps running. Ctrl-C / SIGTERM also closes the tab. Hermes can attach to the same instance (`/browser connect http://127.0.0.1:9222`).

Flags (all `--key=value`; `--cdp-url` also takes `--cdp-url <url>`):

| Flag | Default | Notes |
|---|---|---|
| `--subreddit` | `neovim` | bare name, no `r/` prefix |
| `--timeframe` | `week` | one of `day`, `week`, `month` |
| `--limit` | `50` | listing size; Reddit caps at 100 |
| `--out-dir` | `pipeline/data/raw` | date-stamped subdir is created beneath this |
| `--no-comments` | off | skip the per-post comment fetch (fast iteration) |
| `--cdp-url` | off | fetch through a signed-in Chrome; bare flag means `http://127.0.0.1:$TWIN_CDP_PORT` (default `9222`, same as the launcher); an empty `--cdp-url=` is an error. Without it, plain unauthenticated `fetch` is used (403s today; kept for the OAuth swap, bead `0vb`) |

Writes `<out-dir>/<YYYY-MM-DD>/reddit-<subreddit>.json` (UTC date). Idempotent — re-running the same day overwrites the same file. One stdout line: `wrote N posts → <path>` (English copy; the JSON field is `items`).

#### Env vars

No credentials — the browser profile carries the session.

| Var | Default | Used by |
|---|---|---|
| `TWIN_CDP_PORT` | `9222` | `pnpm pipeline:chrome` and bare `--cdp-url` |
| `TWIN_CHROME_PROFILE` | `~/.config/twin-chrome` | `pnpm pipeline:chrome` |
| `CHROME` | platform Chrome binary | `pnpm pipeline:chrome` |

#### Output schema

```json
{
  "source": "reddit",
  "fetchedAt": "2026-05-04T12:34:56.789Z",
  "params": { "subreddit": "neovim", "timeframe": "week", "limit": 50, "withComments": true },
  "items": [
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

- This automates the owner's own signed-in account. Reddit's User Agreement restricts automated access without consent, and Reddit has said it enforces against logged-in accounts — the owner has accepted the risk of account action. Keep it to one weekly run at personal volume.
- The browser is a normal Chrome profile: no stealth plugins, fingerprint spoofing, or challenge solving. If Reddit serves HTML instead of JSON (signed out, block page, challenge), the fetch throws and the run fails; a human opens the window and looks.
- 1 request/second pacing, 429 `Retry-After` honoring, and 5xx backoff are enforced inside the client (see `client.ts`) for both transports.
- In-browser requests carry Chrome's own User-Agent; the identifying UA applies only to the plain `fetch` transport.

#### Performance

A standard run does `1 + limit` HTTP calls (one listing + one comments fetch per post): at `--limit=25` that's 26 calls, roughly 26 seconds at 1 req/sec (the default `--limit=50` doubles it). Use `--no-comments` for fast iteration during development — drops to a single HTTP call.

#### Known limits

- Requires the CDP Chrome to be running and signed in; a headless/CI host needs the same profile available.
- Anyone on the machine who can reach the CDP port controls that browser, Reddit session included — it binds to 127.0.0.1 only.
- No backfill beyond Reddit's listing window (~1000 posts max regardless of `t=`).
- "more comments" expansion stubs are not followed; only depth-1 comments returned in the first listing are considered.

#### Reddit OAuth status

Reddit OAuth app registered 2026-05-04; Reddit never responded. Reddit stops accepting new public-API requests on 2026-10-31 and retires the public API in March 2027, so approval is unlikely. If it ever lands, bead `0vb` swaps the plain-`fetch` transport for OAuth.

#### Note on `pipeline/data/` and traceability

`pipeline/data/` is gitignored (see `.gitignore`). `TASK.md` originally described raw artifacts as "committed for traceability"; that intent is deferred to whenever GH Actions starts running scrapes. During harness-driven development, **whether to commit a given run's raw output is a per-run editorial choice** — manually `git add -f pipeline/data/raw/<date>/reddit-<sub>.json` if you want it in the PR. Don't flip the gitignore default; it would create churn from local scrape runs.

### GitHub releases (`pipeline/src/sources/github/`)

Scrapes the GitHub Releases API for a single repository — the `## Neovim core` beat. Output is a `RawScrapePayload<GithubRelease>` whose items carry the release notes in `body`.

```bash
pnpm pipeline:scrape:github-releases --owner=neovim --repo=neovim --since=7d
```

Flags (all `--key=value`; `--cdp-url` also takes `--cdp-url <url>`):

| Flag | Default | Notes |
|---|---|---|
| `--owner` | `neovim` | repo owner |
| `--repo` | `neovim` | repo name |
| `--since` | `7d` | ISO date or `Nd` shorthand; releases older than this are filtered out |
| `--per-page` | `30` | GitHub caps at 100; single-page fetch (no pagination today) |
| `--out-dir` | `pipeline/data/raw` | date-stamped subdir is created beneath this |
| `--out-name` | `github-<owner>-<repo>-releases.json` | output filename |

Env: `GITHUB_TOKEN` is optional but recommended — raises the rate limit and is required for private repos. 401/403 responses surface a clear "Set GITHUB_TOKEN" error.

Single-repo, weekly cadence — no retry or pagination today. If the repo posts more than `--per-page` releases in the window, older ones are missed.

### awesome-neovim (`pipeline/src/sources/awesome-neovim/`)

Diffs `rockerBOO/awesome-neovim`'s README.md to extract additions — the `## New plugins` beat. Output is a `RawScrapePayload<AwesomeNeovimAddition>`.

```bash
pnpm pipeline:scrape:awesome-neovim --since=7d
```

Flags (all `--key=value`; `--cdp-url` also takes `--cdp-url <url>`):

| Flag | Default | Notes |
|---|---|---|
| `--repo-url` | `https://github.com/rockerBOO/awesome-neovim.git` | upstream |
| `--repo-dir` | `pipeline/.cache/awesome-neovim` | local clone; gitignored |
| `--since` | `7d` | ISO date or `Nd` shorthand; passed to `git log --since` |
| `--readme` | `README.md` | file to diff |
| `--no-fetch` | off | skip `ensureRepo` (use existing clone as-is) |
| `--out-dir` / `--out-name` | `pipeline/data/raw` / `awesome-neovim-additions.json` | |

Clones with `--filter=blob:none` (blobless partial clone, **not** shallow — `git log --since` needs full history). On re-run, fetches `origin` and `reset --hard origin/HEAD`. Parses additions out of `git log -p -- README.md`; rename/edit pairs (URL appears on both `-` and `+` lines) are excluded from emissions.

## Enricher (`pipeline/src/enrich/`)

The enricher walks each scraped item's URL and fetches the linked content so the LLM has substance to cite, not just headlines. Source-agnostic: every scraper produces items with URLs and the enricher classifies + dispatches per kind.

### Supported link kinds

| Kind | Source | What we fetch |
|---|---|---|
| `github-readme` | `github.com/{owner}/{repo}` | `raw.githubusercontent.com/.../README.md` (with case-fallback chain), capped at 8 KB |
| `github-release` | `github.com/.../releases[/tag/...]` | stub — release notes are already in `item.body` from the releases scraper |
| `html-article` | generic blog URLs | HTML → `@mozilla/readability` main-content extract → markdown via `turndown`, capped at 8 KB |
| `video` | `v.redd.it`, YouTube, Vimeo | skipped; tagged "video; content unavailable for citation" |
| `reddit-self` | `reddit.com/r/.../comments/...` | skipped; the selftext from the Reddit scraper is already the content |
| `reddit-media` | `i.redd.it`, `preview.redd.it`, `external-preview.redd.it` | skipped; image-blob URLs have no citation text |
| `unknown` | non-http(s), malformed URLs | dropped |

Per-item failures don't fail the batch — failed items round-trip with `linkedContent: { kind: "fetch-failed", url, error }`.

For reddit-self posts, the enricher also extracts URLs from `selftext` and attaches them as `linkedContentExtras: EnrichedLink[]` — see `pipeline/src/enrich/selftext.ts`. Only `github-readme`, `html-article`, and `video` kinds are pursued as extras; everything else (`reddit-self`, `reddit-media`, `github-release`, `unknown`) is filtered.

### CLI

```bash
pnpm pipeline:enrich:links [-- --date YYYY-MM-DD] [-- --concurrency N]
```

Reads `pipeline/data/raw/<date>/*.json`, writes `pipeline/data/enriched/<date>/<source>.json`. Idempotent: re-runs skip items already enriched (matched by URL). Exits 0 even if some items fail individually; exits 1 only on systemic failure (cannot read input, cannot write output). One summary line on stdout (`enriched N items, skipped M, failed K`); per-failure details on stderr with the URL named.

### Out of scope (deferred)

- Headless browser fallback (Playwright) for JS-heavy pages — fetch + Readability handles ~80% of links today.
- Cross-run caching — weekly cadence makes a cache pointless.
- GitHub API auth — `raw.githubusercontent.com` is public and our volume is well under the unauth rate limit.

## Drafter (`pipeline/prompts/draft.md`)

No code lives in this repo for the draft stage — it is executed by an external LLM harness that substitutes `{{ISSUE_NUMBER}}`, `{{DATE}}`, and `{{ENRICHED_JSON}}` (the parsed contents of `pipeline/data/enriched/<DATE>/`) into the prompt and emits an MDX file. The prompt is the contract. It encodes the frontmatter/citation schema, the faithfulness rules the next stage will enforce, and the editorial voice.

The faithfulness rule is load-bearing: a source is citable iff its `sources[].url` keys into one of four places — a top-level `item.linkedContent.content` (kinds `github-readme`/`html-article`), a github-release `item.body`, a Reddit self-post `item.selftext` keyed by `item.permalink`, or a `linkedContentExtras[i].content`. `loadSourceContent` in `pipeline/bin/eval-draft.ts` is the code-side mirror — keep both in sync.

## Eval (`pipeline/bin/eval-draft.ts` + `pipeline/src/eval/`)

```bash
pnpm pipeline:eval:draft <path-to-mdx> \
  [--min-words N] [--max-words N] [--skip-links] [--concurrency N] \
  [--faithfulness --enriched-dir pipeline/data/enriched/<DATE> [--faithfulness-model <id>]]
```

Parses frontmatter against `lib/issues/schema.ts`, runs `validateCitations` (`lib/citations.ts`), HEADs every `sources[].url` (with `Retry-After` honoring), and counts words within `[100, 10000]`. With `--faithfulness`, each `(claim, citation)` pair is judged by an LLM against the enriched source text (default model `claude-sonnet-4-6`); usage is printed on stderr. Exits non-zero on any failure.
