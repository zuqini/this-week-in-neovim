# Hermes collaborator notes

Context for the Hermes agent working on this repo alongside the owner (zuqini) and Claude Code. Read this before `AGENTS.md`. Where they disagree, this file wins for your work.

## Ground rules

- **Never push to `main`, never force-push, never merge.** Work on a branch; the owner merges. `AGENTS.md`/`CLAUDE.md` say "work is not done until `git push` succeeds". That is beads boilerplate for the owner's sessions. For you it means pushing *your branch* when asked, nothing more.
- **Beads (`bd`) is read-only for you.** `bd list`, `bd show <id>`, `bd ready` are fine. Writes currently fail: the database is on schema v32 with 21 pending migrations to v53. **Do not run `bd migrate`** (or `BD_ALLOW_REMOTE_MIGRATE=1 …`). Only one clone may migrate the shared remote, and the owner picks which. Put follow-ups in your report instead.
- **Reddit etiquette (load-bearing).** The scraper drives the owner's own signed-in Reddit account:
  - Use the normal Chrome profile only: no stealth plugins, no User-Agent or fingerprint spoofing, no CAPTCHA or challenge solving.
  - Never type Reddit credentials. If the profile is signed out, stop and tell the owner.
  - Keep volume low: tests use `--limit=3` first, then at most one `--limit=25` run. The production cadence is one run per week.
- **Don't commit scrape output.** `pipeline/data/` is gitignored on purpose.
- Read `.claude/review-decisions.md` before suggesting refactors. It lists tradeoffs that were already accepted.

## Setup

```bash
git fetch origin
git checkout main && git pull --ff-only
corepack enable             # pnpm 10.33.2 is pinned in package.json
pnpm install --frozen-lockfile
pnpm test && pnpm typecheck && pnpm build   # same gates as CI (.github/workflows/site.yml)
```

Node 22 per `.nvmrc` (24 also works). Expect 301 passing tests.

## Current task: verify the Reddit browser transport (merged to `main`)

### Why it exists

Reddit has returned 403 for logged-out `.json` requests since ~2026-05-30, and the old scraper died silently then. The OAuth app (registered 2026-05-04) was never approved. Reddit stops taking new public-API requests on 2026-10-31, ends RSS on 2026-11-13, and retires the public API by March 2027. The owner chose to scrape through their own signed-in Chrome and accepted the account risk.

### What changed

- `pipeline/src/sources/reddit/browser.ts` — `openBrowserFetch(cdpUrl)` does the following:
  - attaches to a running Chrome via `playwright-core`'s `connectOverCDP`
  - opens **one** tab on `https://www.reddit.com/robots.txt` (a static same-origin page; the SPA home page re-navigates and kills the evaluate context)
  - fails loudly if that anchor isn't a 2xx or lands off `www.reddit.com` (redirect, consent or challenge page)
  - runs `fetch(url, { credentials: "include" })` inside that tab with a 30 s deadline and returns a real `Response`
  - leaves the existing client's 1 req/s pacing, `Retry-After` handling and 5xx backoff unchanged
  - the client throws when Reddit serves HTML instead of JSON (any 2xx, either transport)
  - `close()` closes only its tab and disconnects; Chrome keeps running
- `pipeline/bin/scrape-reddit.ts` — `--cdp-url[=<url>]` (or `--cdp-url <url>`); the bare flag means `http://127.0.0.1:$TWIN_CDP_PORT` (default 9222). A 403 prints a hint naming the fix. Ctrl-C / SIGTERM closes the scraper's tab before exiting.
- `pipeline/bin/chrome-cdp.sh` / `pnpm pipeline:chrome` launches Chrome with a dedicated profile (`~/.config/twin-chrome`) and CDP on port 9222. Chrome 136+ refuses remote debugging on the default profile. Overrides: `TWIN_CDP_PORT`, `TWIN_CHROME_PROFILE`, `CHROME`.
- Already verified by Claude: the CDP attach, the in-tab fetch, tab cleanup, and the signed-out 403 hint, all against real Chrome 156.
- **Not yet verified:** whether a *signed-in* session gets JSON back. That is the point of your test.

### Test steps

Run these on the host where the signed-in Chrome runs.

1. **Chrome reachable?**
   ```bash
   curl -s http://127.0.0.1:9222/json/version
   ```
   - No answer: start it with `pnpm pipeline:chrome &`, then confirm the window shows a signed-in Reddit account. If it's signed out, stop and ask the owner to sign in.
   - Don't point your own browser tool at the same Chrome (`/browser connect`) while the scraper runs.
2. **Smoke test (1 request):**
   ```bash
   pnpm pipeline:scrape:reddit --cdp-url --no-comments --limit=3 --out-dir=/tmp/twin-raw
   ```
   Expect: `wrote 3 posts → /tmp/twin-raw/<UTC date>/reddit-neovim.json`.
3. **Realistic run (26 requests, ~30 s):**
   ```bash
   pnpm pipeline:scrape:reddit --cdp-url --limit=25
   ```
   Then check `pipeline/data/raw/<date>/reddit-neovim.json`:
   - 25 `items`
   - every `permalink` starts with `https://www.reddit.com/`
   - most items have a non-empty `top_comments`
   - `selftext` is populated on self-posts
4. **Downstream still works:**
   ```bash
   pnpm pipeline:enrich:links --date <same date>
   ```
   Expect `enriched N items, skipped M, failed K`. A few failures are normal.
5. **Cleanup behaved:**
   - `curl -s http://127.0.0.1:9222/json/list` still answers, so Chrome is alive.
   - No leftover `robots.txt` tab.
   - The owner's other tabs are untouched.

### Reading failures

| Output | Meaning | Action |
|---|---|---|
| `cannot connect to Chrome at …` | Chrome not running, or no CDP | step 1 |
| `Reddit request failed: 403` + "signed into Reddit?" hint | signed out, **or** Reddit blocks `.json` even when signed in | check the window. If it's signed in and still 403, that's the key finding: report it |
| `opening https://www.reddit.com/robots.txt landed on …` | anchor page blocked, redirected, or challenged | don't solve it. Report the URL/status with a screenshot |
| `Reddit served text/html … signed out, blocked, or challenged` | login wall, block page, or challenge | don't solve it. Report with a screenshot |
| `TimeoutError` / `signal timed out` | a Reddit request stalled past 30 s | re-run once; if it repeats, report it |
| `Execution context was destroyed` | anchor-page regression | report it with the full stderr |
| `reddit listing schema mismatch at <path>` | Reddit changed the JSON shape | report the path. Don't loosen the schema (see review-decisions, bead `der`) |

### If signed-in `.json` is blocked

The fallback is to parse the rendered `https://www.reddit.com/r/neovim/top/?t=week` page instead. Posts render as `shreddit-post` elements with title, author, score, comment count and permalink as attributes. The output would keep the same `ProjectedPost` shape. **Report first; don't start this without the owner's go-ahead.**

### Report back

Send these to the owner:
- exact commands and the full stdout/stderr of each
- item and comment counts from step 3
- Chrome version (from `/json/version`)
- anything surprising, such as slow responses, 429s, or interstitials

Keep the report factual: say what you ran and saw, not what you expected.

## Project orientation (for later work)

- **What it is:** a static Next.js blog reviving *This Week in Neovim*. A weekly pipeline does **scrape → enrich → draft (LLM) → eval → PR**, and a human reviews and merges. Specs live in `TASK.md` and `pipeline/README.md`; the backlog is `bd list`; `next_steps.md` points to what's next.
- **Faithfulness is the main rule.** Drafts may only state what the enriched JSON contains; every bullet cites `[^sN]`, and `pnpm pipeline:eval:draft` enforces it. If you research online, don't write facts from your browsing into a draft. Add the URLs you find as a source so they go through `pnpm pipeline:enrich:links`, and cite the enriched content. Bullets cited only to your browsing will fail eval.
- **Drafter contract:** `pipeline/prompts/draft.md`. **Eval:** `pnpm pipeline:eval:draft <mdx> [--faithfulness --enriched-dir …]`. The faithfulness judge defaults to `claude-sonnet-4-6` and needs `ANTHROPIC_API_KEY`. `pipeline/bin/prep-faithfulness.ts` (untracked, owner's WIP) emits judge prompts as JSONL for harness-side judging.
- **Known gaps** (likely future asks):
  - one `pipeline:week` entry point that runs every scraper and the enricher and tolerates per-source failures
  - a Hermes runbook skill for the weekly loop
  - a `runtime/doc/news.txt` diff scraper for `## Neovim core` (the releases scraper only sees `nightly`, whose notes are boilerplate)
  - the source beads `jzg`, `q94`, `hmn`, `8gz`, `ei7`, `40l`, `4kv`
- **Weekly-run caveat:** the signed-in Chrome must be running when the cron fires. When the Reddit session expires, the scrape fails loudly. Notify the owner and continue the issue without Reddit; don't retry in a loop.
