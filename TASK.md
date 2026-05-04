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

### Weekly pipeline (lives in `pipeline/`, invoked by an LLM harness)
TypeScript (Node 22, same toolchain as the site). The pipeline is a set of small CLIs the **LLM drafting harness** invokes as bash tools during a weekly drafting session — not a GH Actions cron job. The harness orchestrates: run scrapers → run enricher → read enriched JSON → draft MDX → self-eval → open PR. Stages:
1. **Scrape** — one CLI per source. Each scraper writes `pipeline/data/raw/<YYYY-MM-DD>/<source>.json` (UTC date, idempotent on re-run). Prefer official APIs/JSON over HTML scraping to respect ToS:
   - r/neovim → `https://www.reddit.com/r/{sub}/top.json` with identifying User-Agent (load-bearing); migrate to OAuth client_credentials when the registered Reddit app is approved.
   - GitHub trending Lua (Neovim plugins) → GitHub Search API (`q=topic:neovim-plugin pushed:>last-week sort:stars`)
   - awesome-neovim newly-added → diff `README.md` over the last 7 days via `git log -p`
   - Plugin author RSS feeds → curated list in `pipeline/sources.yml`
   - Optional: YouTube channel feeds (TJ DeVries, ThePrimeagen) for "Notable posts & videos"
2. **Enrich** — source-agnostic CLI that walks each item's URL: GitHub repos → fetch `raw.githubusercontent.com/.../README.md`; blog posts → fetch + Readability extract → markdown; videos (v.redd.it, youtube) → marked as "content unavailable for citation". Output: `pipeline/data/enriched/<date>/<source>.json`. Without enrichment, link posts collapse to titles and the LLM has nothing substantive to cite — this stage is what makes "great" vs "thin" issues.
3. **Draft** — the harness LLM (Claude Sonnet 4.6 or Opus 4.7) reads the enriched JSON directly, drafts the MDX with strict instruction: "Only summarize content provided in the enriched payloads; if a fact isn't there, omit it. Every bullet must end with `[^sN]` where N is a source id." Output: `content/issues/<date>.draft.mdx`.
4. **Self-eval** — the harness invokes two checks before opening a PR:
   - **Programmatic** (CLI): every `[^sN]` resolves to a real `sources` entry; no bullet without a citation; all source URLs return 200; word count within bounds.
   - **LLM-as-judge** (separate Claude call): faithfulness scoring — for each bullet, does the cited source actually support the claim? Rejected bullets get logged into the PR description for the human reviewer.
5. **PR** — harness invokes `gh pr create` against `main` with the draft MDX, optionally git-add'd raw/enriched artifacts (per editorial choice — `pipeline/data/` is gitignored by default), eval report in body. Human reviews the diff (this is the editorial pass), merges Sunday.
6. **Publish** — merge to `main` triggers the GH Actions build workflow → static export → deploy. (This is the only GH Actions piece; the weekly drafting flow is harness-driven.)

### Faithfulness guardrails (this is the main risk per Notes)
- LLM input is the enriched JSON only — no general knowledge, no web access during drafting beyond what the scraper+enricher already fetched.
- Citation-or-omit rule enforced both in the prompt and in eval; a bullet without a working `[^sN]` blocks the PR.
- The PR diff *is* the editorial surface. Reviewer sees: changed MDX, optionally git-add'd scrape/enriched artifacts, eval report. No LLM output ever auto-merges.
- If the eval rejects too many bullets, the harness opens a PR with a draft tagged `needs-rewrite` instead of dropping the run — better to have a starting point than nothing.

### Deploy & ops
- **Hosting**: Cloudflare Pages (free tier, fast global CDN, deploys from GH Actions artifact). GH Pages is a fine fallback. Vercel works but is overkill for a static export.
- **GH Actions** — only one workflow: `.github/workflows/site.yml` on push to `main`: `pnpm build` → upload `out/` to Cloudflare Pages. No weekly cron — the drafting pipeline is invoked by an LLM harness from the user's machine (or wherever the harness runs).
- **Secrets** — split by where they're consumed:
  - GH Actions: `CLOUDFLARE_API_TOKEN` (deploy only).
  - LLM harness host (local `.env` or shell config): `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (for `gh pr create`), and eventually `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` when the OAuth migration lands.

### Phasing (ship the site before automating it)
1. **Phase 1 — Site shell.** Next.js scaffold, palette ported, layout/nav/footer, archive page, one hand-written issue, RSS, sitemap, OG cards, deploy to Cloudflare Pages. Done = a real URL with one real post.
2. **Phase 2 — Pipeline CLIs, harness-invoked.** Scrapers (Reddit first) + enricher + programmatic eval, runnable as `pnpm pipeline:scrape:reddit` etc. The LLM harness orchestrates a weekly drafting session that produces a draft MDX + opens a PR. Validates the full loop before any scheduling.
3. **Phase 3 — Scheduling.** A cron (or a `/loop`-style routine) kicks off the harness on a weekly cadence. The schedule lives in the harness layer, not in this repo.
4. **Phase 4 — Polish.** Manual theme toggle, search (Pagefind — it indexes the static `out/` directory and needs no backend), per-section RSS, plugin-name autocomplete in archive.

### Open questions to resolve before Phase 1
- Domain: register `thisweekinneovim.org` (the `.org` lapsed when the original went dormant — worth checking) or use a subdomain.
  - I'll register later
- Reach out to hadronized about reusing the "This Week in Neovim" name and optionally backfilling the dotfyle archive — preserves SEO and reader trust.
  - hadronized actually no longer maintains this. The latest iteration of TWiN actually falls on https://github.com/codicocodes/dotfyle.
  - Heads-up posted: https://github.com/codicocodes/dotfyle/discussions/194 (non-blocking; proceed unless they object).
- Decide on attribution model for plugin authors (auto-link to GitHub repo + author handle?).
  - both
