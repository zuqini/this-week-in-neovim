---
name: weekly-issue
description: "Draft this week's TWiN issue and open its PR. Runs pnpm pipeline:week (scrape + enrich), drafts content/issues/<date>.mdx per pipeline/prompts/draft.md, runs the programmatic eval, pushes weekly/<date>, opens the PR, and reports to the owner."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [twin, neovim, newsletter, weekly, pipeline]
    category: publishing
---

# Weekly TWiN issue

Runbook for one weekly issue of *This Week in Neovim*, from scrape to an open PR. The owner reviews, runs the faithfulness judge, and merges; merging publishes. Follow the steps in order. When a step says **stop**, stop, report to the owner (see step 8 for what to include), and don't improvise a workaround.

The ground rules in `HERMES.md` still apply: never push `main`, never force-push, never merge, Reddit etiquette, beads rules. This skill is your standing permission to push the `weekly/<D>` branch and open its PR, nothing more.

**Never edit anything under `pipeline/data/` by hand.** The enriched JSON is the evidence the owner's judge checks the draft against. If eval fails, fix the draft, not the evidence.

**Shell variables don't carry over between steps.** Each block below sets `D` (the issue date, today's UTC date) and, where it needs it, `N` (the issue number) itself. From step 4 on, each block also checks that `pipeline/data/runs/$D.json` exists. If it doesn't, the UTC date has rolled over since step 3: **stop**.

## 1. Inputs

```bash
git fetch origin
D=$(date -u +%F)
N=$(( $(git grep -h '^issue:' origin/main -- 'content/issues/*.mdx' | awk '{print $2}' | sort -n | tail -1) + 1 ))
echo "D=$D N=$N"
```

**Stop and ask the owner** if any of these is true:

- `git ls-remote --heads origin "weekly/$D"` prints anything (this week's branch already exists).
- `git cat-file -e "origin/main:content/issues/$D.mdx"` succeeds (the issue file already exists on main).
- `git cat-file -e "origin/main:pipeline/data/enriched/$D"` succeeds (this date's evidence is already on main; the owner's judge refuses PRs that touch it).
- An earlier weekly PR is still open:
  ```bash
  gh pr list --state open --json number,headRefName,url \
    --jq '.[] | select(.headRefName | startswith("weekly/")) | "\(.number) \(.headRefName) \(.url)"'
  ```
  prints anything.

## 2. Preflight

```bash
git checkout main && git pull --ff-only
git status --porcelain              # must print nothing; otherwise stop
pnpm install --frozen-lockfile
bd list >/dev/null || { bd bootstrap --yes && bd list >/dev/null; }   # once per clone; never `bd migrate`
gh auth status
```

Chrome for the Reddit scraper:

```bash
curl -s "http://127.0.0.1:${TWIN_CDP_PORT:-9222}/json/version"
```

- No answer: run `pnpm pipeline:chrome &` **once**, wait a few seconds, and check again. Still nothing: continue; Reddit will fail and be reported.
- If the window shows Reddit signed out: **never sign in** and never type credentials. Continue; Reddit will fail with a 403 and you report it.
- Don't attach your own browser tool to that Chrome (`/browser connect`) while the scrape runs.

## 3. Scrape + enrich

```bash
D=$(date -u +%F)
export GITHUB_TOKEN=$(gh auth token)   # raises the GitHub releases rate limit
pnpm pipeline:week
echo "exit=$?"
cat "pipeline/data/runs/$D.json"
```

If `pipeline/data/runs/$D.json` doesn't exist, the UTC date rolled over while it ran. **Stop.**

| Exit | Meaning | Action |
|---|---|---|
| `0` | every scraper and enrich succeeded | continue |
| `2` | one or more scrapers failed; enrich succeeded on the rest | read each failed step's `error`. If `reddit` failed, notify the owner now with `steps[reddit].error` (see the failure table), then continue without Reddit. Other failed sources: note them for the PR body and continue |
| `1` | enrich failed (e.g. every scraper failed, so `raw/$D/` is empty) or bad args | **stop** |

No retry loop. Re-run `pnpm pipeline:week` at most once, and only when the failed step's error is a `TimeoutError` / `signal timed out`. If a failed step's file still shows up in `rawFiles`, it's a stale file from an earlier run today: say so in the PR body.

## 4. Draft

```bash
D=$(date -u +%F)
N=$(( $(git grep -h '^issue:' origin/main -- 'content/issues/*.mdx' | awk '{print $2}' | sort -n | tail -1) + 1 ))
if [ ! -f "pipeline/data/runs/$D.json" ]; then echo "STOP: UTC date rolled over since step 3"; else
  echo "D=$D N=$N"; ls "pipeline/data/enriched/$D/"
fi
```

Follow `pipeline/prompts/draft.md` exactly, with `{{DATE}}` = `$D`, `{{ISSUE_NUMBER}}` = `$N`, and `{{ENRICHED_JSON}}` = the parsed contents of every `pipeline/data/enriched/$D/*.json` (keys are the filenames). Write the result to `content/issues/$D.mdx`.

- No `draft:` key in the frontmatter, and not a `.draft.mdx` filename: the open PR is the draft gate, and `SLUG_SHAPE` rejects `.draft` in `content/issues/` (the build fails).
- Only the enriched JSON is citable. Never put facts from your own browsing into the draft; bullets cited to anything else fail eval.
- Skip sections with nothing citable rather than padding them.

## 5. Programmatic eval

```bash
D=$(date -u +%F)
if [ ! -f "pipeline/data/runs/$D.json" ]; then echo "STOP: UTC date rolled over since step 3"; else
  pnpm pipeline:eval:draft "content/issues/$D.mdx"
fi
```

No `--faithfulness` here, and you don't need `ANTHROPIC_API_KEY`; the owner runs the judge on the PR. Ignore the `--faithfulness` line in `draft.md`'s "What the eval will run".

On failure, fix the draft (never the files under `pipeline/data/`) and re-run. At most **2 rewrites**. If it still fails after that, continue anyway and open the PR as a GitHub draft (step 7).

Then run the build gates (PRs get no CI):

```bash
pnpm test && pnpm typecheck && pnpm build
```

If these fail because of the new issue file, fix the file (counts against the same 2 rewrites). If they fail for any other reason, **stop**.

## 6. Branch, commit, push

```bash
D=$(date -u +%F)
if [ ! -f "pipeline/data/runs/$D.json" ]; then echo "STOP: UTC date rolled over since step 3"; else
  git checkout -b "weekly/$D" &&
    git add "content/issues/$D.mdx" &&
    git add -f pipeline/data/enriched/$D/*.json &&
    git status --short
fi
```

`git status --short` must show only `content/issues/$D.mdx` and `pipeline/data/enriched/$D/*.json` as staged. If anything else is staged, unstage it (`git restore --staged <path>`) before committing. Then:

```bash
D=$(date -u +%F)
N=$(( $(git grep -h '^issue:' origin/main -- 'content/issues/*.mdx' | awk '{print $2}' | sort -n | tail -1) + 1 ))
if [ ! -f "pipeline/data/runs/$D.json" ]; then echo "STOP: UTC date rolled over since step 3"; else
  git commit -m "Content: TWiN #$N draft ($D)" && git push -u origin "weekly/$D"
fi
```

- Never stage `pipeline/data/raw/`, `pipeline/data/runs/`, or `.beads/`.
- Never force-push, never touch `main`. If the push is rejected, **stop**.

## 7. Open the PR

Write the body to a temp file, then:

```bash
D=$(date -u +%F)
N=$(( $(git grep -h '^issue:' origin/main -- 'content/issues/*.mdx' | awk '{print $2}' | sort -n | tail -1) + 1 ))
if [ ! -f "pipeline/data/runs/$D.json" ]; then echo "STOP: UTC date rolled over since step 3"; else
  gh pr create --base main --head "weekly/$D" \
    --title "This Week in Neovim #$N ($D)" --body-file <body-file>
fi
```

Add `--draft` if eval still failed after 2 rewrites.

The body contains:

1. A run-summary table from `pipeline/data/runs/$D.json`: one row per step with `ok`, `summary` (or `error` for failed steps), and `durationMs`.
2. **Failed sources**: each failed step and its `error`, verbatim, in a fenced block. Note any stale same-day raw files.
3. **Programmatic eval**: the full output of the last `pnpm pipeline:eval:draft` run, in a fenced block. If it still fails, put `needs-rewrite` on its own line above it.
4. As the last line, verbatim:
   ```
   Faithfulness: pending — owner runs `pnpm pipeline:judge:pr <n>`
   ```

If `gh pr create` fails, **stop** (the branch stays pushed; say so in the report).

## 8. Report to the owner

- PR URL (and whether it's a draft PR)
- per-source item counts (each step's `summary` line)
- failed sources and their errors
- eval status (pass, or the failures left after 2 rewrites)
- IDs of any beads you filed

Follow-ups (a scraper bug, a source that needs a new kind, a drafting gap) go into beads per the rules in `HERMES.md` (`-l hermes`), not just the report. List the IDs you filed.

## 9. Clean up

```bash
git checkout main
```

Leave `pipeline/data/` alone. Switching to `main` removes `pipeline/data/enriched/$D/` from the working tree, because those files are tracked only on `weekly/$D`; `raw/` and `runs/` stay. To redraft after review, `git checkout weekly/$D` first so the same evidence is back, edit only `content/issues/$D.mdx`, commit, and push (never force). Don't re-run `pnpm pipeline:week` for a redraft: it would rewrite the evidence.

## Failure table

| Output | Meaning | Action |
|---|---|---|
| `pipeline:week` exit `1` | enrich failed or bad args | stop + report `steps[enrich].error` |
| `pipeline:week` exit `2` | some scrapers failed | continue without them; list them in the PR body |
| `expected output … not found (UTC date rolled over?)` or `… predates this run (stale same-day file …)` | the scraper's output went under a different UTC date, or only an older file is there | stop + report; re-run on a fresh day |
| `cannot connect to Chrome at …` | Chrome not running, or no CDP | you already tried `pnpm pipeline:chrome &` once in preflight; continue without Reddit and report it |
| `Reddit request failed: 403` + "signed into Reddit?" hint | the profile is signed out, **or** Reddit blocks `.json` even when signed in | notify the owner with the error; continue without Reddit. Never sign in yourself |
| `opening https://www.reddit.com/robots.txt landed on …` | anchor page blocked, redirected, or challenged | don't solve it; report the URL/status; continue without Reddit |
| `Reddit served text/html … signed out, blocked, or challenged` | login wall, block page, or challenge | don't solve it; report; continue without Reddit |
| `TimeoutError` / `signal timed out` | a Reddit request stalled past 30 s | re-run `pnpm pipeline:week` once; if it repeats, continue without Reddit and report |
| `reddit listing schema mismatch at <path>` | Reddit changed the JSON shape | report the path; don't loosen the schema; continue without Reddit |
| eval still failing after 2 rewrites | draft can't satisfy the contract | open the PR with `--draft` and `needs-rewrite` in the body; never edit `pipeline/data/` to make it pass |
| `pnpm test` / `pnpm typecheck` / `pnpm build` fails for a reason other than the new issue | broken `main` or environment | stop + report |
| `git push` / `gh pr create` rejected or failing | permissions, network, or the branch exists | stop + report; never force |
