# this-week-in-neovim

## Status
- PR: none yet
- Branch: main (fresh repo, only `first commit` exists)

## Goal
Revive "This Week in Neovim" as a static blog that pairs the visual language of neovim.io with the weekly roundup format of the original dotfyle.com TWiN archive, covering new and updated plugins, ecosystem news, and notable community posts. Every weekend, an automated pipeline scrapes a curated set of sources and hands the gathered material to an LLM that drafts the week's post from it. Each draft then runs through an evaluation metric and a human review pass before it gets published, keeping the cadence sustainable without sacrificing editorial quality.

## Notes
- Original site (now dormant): https://dotfyle.com/this-week-in-neovim
- Styling reference: https://neovim.io/ (open-source site, source is on GitHub)
- Content sources to consider for scraping: r/neovim, GitHub trending Lua/Neovim, plugin author RSS feeds, the original TWiN archive itself for format reference.
- LLM faithfulness is the main risk: keep the LLM as a summarizer of fetched content, never as the source of facts.
- Scraping ToS: prefer RSS/APIs over HTML scraping where feasible.

## Approach

Two loosely-coupled halves: a **static Next.js site** that renders weekly issues stored as MDX in this repo, and a **weekly content pipeline** that produces those MDX files via scrape → LLM draft → eval → human review. The site never calls an LLM at runtime; everything ships as pre-rendered HTML.

### Stack
- **Next.js 16 (App Router) + TypeScript**, `output: 'export'` in `next.config.mjs` for a fully static build (`out/`). Pre-renders every issue at build time; no server required.
- **MDX via `@next/mdx`** (`@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`). `pageExtensions: ['ts','tsx','md','mdx']`. Frontmatter via `gray-matter` (since `@next/mdx` doesn't parse YAML frontmatter natively); each MDX also re-`export const metadata` so Next's metadata API picks it up.
- **Remark/rehype plugins**: `remark-gfm` (tables, task lists), `rehype-slug` + `rehype-autolink-headings` (issue ToC anchors), `rehype-pretty-code` (Shiki-based syntax highlighting — Lua/Vimscript matter to this audience).
- **Tailwind v4 + `@tailwindcss/typography`** for `prose` classes on issue bodies; design tokens live as CSS custom properties (see Visual design) and Tailwind reads them via `theme()` extensions. Tailwind because it composes cleanly with the Hugo-style minimalism we want — no component library.
- **No CMS, no DB.** Content is files in git. This is the whole point: faithfulness audit = `git diff`.

### Visual design (port from neovim.io's `static/css/main.css`)
Light mode: `--fg #29332f`, `--bg #e7eee8`, `--accent-bg #d3e4db`, `--link #195174`, `--accent #000`, `--border #658fac`. Dark mode (via `prefers-color-scheme`): `--fg #a9d5c4`, `--bg #0f191f`, `--accent-bg #0b151b`, `--link #5fb950`, `--accent #61ff00`, `--border #1174b1`. CTA gradient `#00b952 → #378ccc`. System sans body, monospace for code (Geist Mono or JetBrains Mono). Underlined links with `--border` color — recognizably neovim.io. Container max-width 1200px. Start with `prefers-color-scheme` only; add a manual toggle only if a user asks.

### Content model
```
content/issues/
  2026-05-04.mdx          # filename = publish date (Monday)
```
Frontmatter (validated with Zod at build):
```yaml
issue: 1
title: "This Week in Neovim #1"
date: 2026-05-04
summary: "One-line teaser used in archive cards and RSS."
sources:                  # every URL the LLM was allowed to read
  - { id: s1, url: "...", fetched_at: "2026-05-03T..." }
```
Body sections mirror the original TWiN schema so readers landing from the dotfyle archive feel at home: `## Neovim core`, `## New plugins`, `## Updated plugins`, `## Notable posts & videos`, `## Community`. Each bullet ends with a `[^s3]`-style footnote pointing into `sources` — rendered inline as a small superscript link.

### Routing (App Router)
```
app/
  layout.tsx              # nav, footer, theme tokens, font loading
  page.tsx                # home: latest issue inline + 5 most recent cards
  issues/
    page.tsx              # full archive, paginated by year
    [slug]/page.tsx       # one issue; generateStaticParams reads content/issues/*.mdx
  feed.xml/route.ts       # RSS 2.0
  sitemap.ts              # next-sitemap-equivalent built-in
  robots.ts
  opengraph-image.tsx     # generated per-issue OG card
mdx-components.tsx        # required by @next/mdx with App Router
content/issues/*.mdx
lib/issues.ts             # fs.readdir + gray-matter + Zod, server-only
```
`generateStaticParams` reads the `content/issues/` directory; `dynamicParams = false` so anything not in the index 404s. Issue list helpers (`getAllIssues`, `getIssueBySlug`) are server-only and tree-shaken out of the client bundle.

### Weekly pipeline (separate package, `pipeline/`)
TypeScript (Node 22, same toolchain as the site), invoked from a GitHub Actions cron. Stages:
1. **Scrape** — one adapter per source. Prefer RSS/APIs over HTML to respect ToS:
   - r/neovim → `https://www.reddit.com/r/neovim/.rss`
   - GitHub trending Lua (Neovim plugins) → GitHub Search API (`q=topic:neovim-plugin pushed:>last-week sort:stars`)
   - awesome-neovim newly-added → diff `README.md` over the last 7 days via `git log -p`
   - Plugin author RSS feeds → curated list in `pipeline/sources.yml`
   - Optional: YouTube channel feeds (TJ DeVries, ThePrimeagen) for "Notable posts & videos"
   Output: `pipeline/data/raw/<date>/<source>.json` — raw artifacts, committed for traceability.
2. **Normalize** — strip HTML, dedupe, classify each item into a section bucket. Output: `pipeline/data/normalized/<date>.json`.
3. **Draft** — single Claude (Sonnet 4.6) call. Prompt template: rules + section schema + normalized JSON. Strict instruction: "Only summarize content provided in `<sources>`; if a fact isn't there, omit it. Every bullet must end with `[^sN]` where N is a source id." Output: `content/issues/<date>.draft.mdx`.
4. **Eval** — two passes, both must succeed before a PR is opened:
   - **Programmatic**: every `[^sN]` resolves to a real `sources` entry; no bullet without a citation; all source URLs return 200; word count within bounds.
   - **LLM-as-judge** (Claude Opus): faithfulness scoring — for each bullet, does the cited source actually support the claim? Reject if score < threshold; the rejected bullets get logged into the PR description for the human reviewer.
5. **PR** — `gh pr create` against `main` with the draft MDX, raw artifacts as commit, eval report in body. Human reviews the diff (this is the editorial pass), merges Sunday.
6. **Publish** — merge to `main` triggers the build workflow → static export → deploy.

### Faithfulness guardrails (this is the main risk per Notes)
- LLM input is the normalized JSON only — no general knowledge, no web access during drafting.
- Citation-or-omit rule enforced both in the prompt and in eval; a bullet without a working `[^sN]` fails CI.
- The PR diff *is* the editorial surface. Reviewer sees: changed MDX, raw scrape artifacts, eval report. No LLM output ever auto-merges.
- If the eval rejects too many bullets, the workflow opens a PR with a draft tagged `needs-rewrite` instead of failing silently — better to have a starting point than nothing.

### Deploy & ops
- **Hosting**: Cloudflare Pages (free tier, fast global CDN, deploys from GH Actions artifact). GH Pages is a fine fallback. Vercel works but is overkill for a static export.
- **Workflows**:
  - `.github/workflows/site.yml` — on push to `main`: `pnpm build` → upload `out/` to Cloudflare Pages.
  - `.github/workflows/weekly.yml` — `cron: "0 14 * * 6"` (Saturday 14:00 UTC): runs the pipeline, opens PR. Manual `workflow_dispatch` for testing.
- **Secrets**: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (auto), `CLOUDFLARE_API_TOKEN`.

### Phasing (ship the site before automating it)
1. **Phase 1 — Site shell.** Next.js scaffold, palette ported, layout/nav/footer, archive page, one hand-written issue, RSS, sitemap, OG cards, deploy to Cloudflare Pages. Done = a real URL with one real post.
2. **Phase 2 — Pipeline, manual trigger.** Scrapers + normalize + draft + eval, run locally with `pnpm pipeline:run`. Output a draft MDX a human edits and commits by hand. Validates the prompt and eval before adding cron.
3. **Phase 3 — Cron + PR automation.** Move to scheduled GH Action with PR creation. Enable weekly cadence.
4. **Phase 4 — Polish.** Manual theme toggle, search (Pagefind — it indexes the static `out/` directory and needs no backend), per-section RSS, plugin-name autocomplete in archive.

### Open questions to resolve before Phase 1
- Domain: register `thisweekinneovim.org` (the `.org` lapsed when the original went dormant — worth checking) or use a subdomain.
  - I'll register later
- Reach out to hadronized about reusing the "This Week in Neovim" name and optionally backfilling the dotfyle archive — preserves SEO and reader trust.
  - hadronized actually no longer maintains this. The latest iteration of TWiN actually falls on https://github.com/codicocodes/dotfyle.
  - Heads-up posted: https://github.com/codicocodes/dotfyle/discussions/194 (non-blocking; proceed unless they object).
- Decide on attribution model for plugin authors (auto-link to GitHub repo + author handle?).
  - both
