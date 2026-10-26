# Hermes collaborator notes

Context for the Hermes agent working on this repo alongside the owner (zuqini) and Claude Code. This is the only context file Hermes loads here (`HERMES.md` takes precedence over `AGENTS.md`/`CLAUDE.md`), so everything you need is in this file. Those two are beads boilerplate written for the owner's sessions; where they disagree, this file wins for your work.

## Ground rules

- **Never push to `main`, never force-push, never merge.** Work on a branch; the owner merges. `AGENTS.md`/`CLAUDE.md` say "work is not done until `git push` succeeds". That is beads boilerplate for the owner's sessions. For you it means pushing *your branch* when asked, nothing more. The `weekly-issue` skill is standing permission to push its `weekly/<date>` branch and open that PR; it never merges either.
- **Beads (`bd`).** The shared database lives on the GitHub remote (`refs/dolt/data`), so your push access covers it.
  - Once per clone: `bd bootstrap --yes`, then `bd list` to confirm. **Never run `bd migrate`** (or `BD_ALLOW_REMOTE_MIGRATE=1 …`); the owner's clone migrates the shared remote.
  - Read freely: `bd list`, `bd show <id>`, `bd ready`.
  - File follow-ups as beads instead of only listing them in a report: `bd dolt pull` first, then `bd create --title "…" -t bug|feature|task -p <0-4> -l hermes -d "…"` (add `--deps discovered-from:<id>` when it came out of another bead), then `bd dolt push`. Never `bd dolt push --force`. If the push is rejected, `bd dolt pull` and push once more; on a conflict, stop and report.
  - Don't close, claim, or edit the owner's beads unless asked.
  - List the IDs you filed in your report.
- **Reddit etiquette (load-bearing).** The scraper drives the owner's own signed-in Reddit account:
  - Use the normal Chrome profile only: no stealth plugins, no User-Agent or fingerprint spoofing, no CAPTCHA or challenge solving.
  - Never type Reddit credentials. If the profile is signed out, tell the owner (in the weekly loop, carry on without Reddit).
  - Keep volume low: tests use `--limit=3` first, then at most one `--limit=25` run. The production cadence is one `pnpm pipeline:week` per week, plus at most one re-run after a timeout.
- **Don't commit scrape output.** `pipeline/data/` is gitignored on purpose. One exception: a weekly issue PR force-adds that run's `pipeline/data/enriched/<date>/*.json` (the judge and the audit trail need it). Never commit `pipeline/data/raw/` or `pipeline/data/runs/`.
- **Use non-interactive commands.** `cp`/`mv`/`rm` may be aliased to `-i` and hang waiting for input: use `cp -f`, `mv -f`, `rm -f` / `rm -rf`; `ssh`/`scp` with `-o BatchMode=yes`.
- Read `.claude/review-decisions.md` before suggesting refactors. It lists tradeoffs that were already accepted.

## Setup

```bash
git fetch origin
git checkout main && git pull --ff-only
corepack enable             # pnpm 10.33.2 is pinned in package.json
pnpm install --frozen-lockfile
bd bootstrap --yes          # once per clone (never `bd migrate`)
bd list                     # beads reachable
pnpm test && pnpm typecheck && pnpm build   # same gates as CI (.github/workflows/site.yml)
```

Node 22 per `.nvmrc` (24 also works). Expect 348 passing tests.

## Weekly loop

Each week you draft the issue and open its PR; the owner judges and merges.

- **Runbook:** the `weekly-issue` skill (`.hermes/skills/weekly-issue/SKILL.md`). It covers preflight, `pnpm pipeline:week`, drafting, the programmatic eval, pushing `weekly/<date>`, the PR, the report, and the failure table.
- **Scrape + enrich:** `pnpm pipeline:week` runs every scraper and the enricher for today's UTC date, keeps going when one source fails, and writes `pipeline/data/runs/<date>.json`. Exit `0` all ok, `2` some source failed, `1` enrich failed. See `pipeline/README.md`.
- **Faithfulness judge:** runs on the owner's machine via `pnpm pipeline:judge:pr <n>`, which reads your PR's draft and enriched JSON and posts the verdict as a PR comment. You never need `ANTHROPIC_API_KEY`.
- **Caveat:** the signed-in `pnpm pipeline:chrome` window must be running when the run starts. If the Reddit session has expired, the run reports it; notify the owner and ship the issue without Reddit (details in the skill).

One-time setup on the Hermes host (`<clone>` = absolute path of this clone):

```bash
hermes skills trust <clone>        # allow repo-local skills from .hermes/skills/
hermes gateway install             # cron jobs only run while the gateway is up
hermes cron create "0 6 * * 1" "Run the weekly-issue skill" --skill weekly-issue --workdir <clone>
```

The schedule must fire on Monday in UTC (the issue date is the UTC run date). Hermes evaluates cron in its configured timezone (`HERMES_TIMEZONE`, else `timezone` in `~/.hermes/config.yaml`, else the host's local time), not UTC: `0 6 * * 1` is Monday UTC anywhere from UTC−12 to UTC+6; further east, set the hour to at least your UTC offset (e.g. `0 9 * * 1` at UTC+9). Keep the signed-in `pnpm pipeline:chrome` window running on that host.

## Current task: verify the Reddit browser transport (merged to `main`, bead `fwa`)

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
- **Drafter contract:** `pipeline/prompts/draft.md`. **Eval:** `pnpm pipeline:eval:draft <mdx>` (citations, word count, links). You run it without `--faithfulness`; the LLM faithfulness judge runs on the owner's machine (`pnpm pipeline:judge:pr`).
- **Known gaps:** the backlog lives in beads (`bd ready`, `bd list --label hermes`). Source coverage per section is the table in `next_steps.md`. The weekly loop was `vrn`/`22k`/`9ko`; the `runtime/doc/news.txt` scraper for `## Neovim core` is `zn7`.
- **Weekly-run caveat:** see the `weekly-issue` skill (Reddit down → notify the owner, continue without it, no retry loop).
