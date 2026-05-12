# Review decisions

Accepted tradeoffs reviewers should not re-flag. Before adding an entry, search for an existing one and append to its `History:`.

Schema: `title` / `Flagged` / `Decision` required; `Type` / `Anchor` / `Filed` / `History` / `Revisit when` optional. Lifecycle: `~/.claude/skills/review/SKILL.md`.

## Recurring false flags

<!-- Promote entries here once they've been raised on separate passes by different reviewers/agents. -->

## Decisions

### Per-slug dynamic MDX import is a scaling cliff
- Flagged: webpack bundles every MDX under `content/issues/` as its own async chunk; build-time cliff at 50–200 issues.
- Decision: deferred. One issue today; the fix (precompile MDX to HTML at build) is a non-trivial migration that should land with `dr9` (RSS `content:encoded`).
- Filed: bead `swk`
- Revisit when: ~20 issues exist

### Render-shape projection layer between schema and renderers
- Flagged: feed, OG, MDX anchor, root metadata, and per-issue metadata each implement their own truncation / XML codepoint / host-detection policies without a shared `RenderableIssue`.
- Decision: premature — one feed renderer, one OG card per shape, two metadata sites. Extracting a render-shape layer over one of each adds indirection without consolidating real duplication.
- Revisit when: a third metadata site lands (tag pages, Atom, JSON feed)

### `getAllIssues` singleton + `process.cwd` coupling
- Flagged: `lib/issues/index.ts` reads `process.cwd()` at module load; `getAllIssues` is a memoized singleton.
- Decision: deferred. Real fix is a multi-route refactor plus an `app/_data.ts` composition root — cleaner paired with `swk`'s MDX precompile (overlapping touch points).
- Filed: bead `37z`
- Revisit when: `swk` lands

### Dedupe `openGraph`/`twitter` metadata between root and per-issue layouts
- Flagged: `app/layout.tsx` and `app/issues/[slug]/page.tsx` both construct overlapping `openGraph` + `twitter` objects.
- Decision: kept. Root is `type: "website"` + `SITE.name`; per-issue is `type: "article"` + `issue.title` + `publishedTime`. A helper for two callers with disjoint inputs takes 5+ parameters and doesn't collapse.
- Revisit when: a third route (e.g. tag pages) creates real triplicate

### Unreachable `notFound()` in `opengraph-image.tsx`
- Flagged: `if (!issue) notFound()` is unreachable because `generateStaticParams` returns the closed set.
- Decision: kept. Removing it forces a non-null assertion or an assert helper; the defensive branch satisfies TS without ceremony.

### `SITE_FLOOR_DATE` hardcoded in `app/sitemap.ts`
- Flagged: literal `"2026-05-01"` rather than env var or "oldest issue date".
- Decision: editorial product constant — launch date is fixed. A single grep-able literal beats parameterizing for one caller.

### OG gradient inlined outside `PALETTE`
- Flagged: `linear-gradient(135deg, ...)` with hardcoded angle and stops.
- Decision: premature with two cards.
- Anchor: lib/og/cards.tsx:18
- Revisit when: a third card variant needs a different gradient

### `memoize`'s `when: () => process.env.NODE_ENV === "production"` predicate
- Flagged: predicate name "production" hides the intent ("cache during static export; never during dev/test so HMR sees content edits").
- Decision: kept. One call site; JSDoc on `memoize` carries the intent. Wrapping in `memoInProd(...)` is indirection for a single use.
- Revisit when: a third caller appears with a different policy

### Memoized-accessor placement differs between `lib/issues/` and `lib/og/`
- Flagged: `getAllIssues` exported from the `lib/issues` barrel; `getOgFonts` lives next to its dependency in `lib/og/fonts.ts`. Pattern divergence.
- Decision: kept. `getAllIssues` is `lib/issues`'s public API; `getOgFonts` is an internal detail (only `renderOg` calls it). Both placements are right for their role.

### `lib/memo.ts` is over-abstracted for two callers
- Flagged: generic `memoize` with a `when` predicate, used twice.
- Decision: kept. 22 lines, clearly correct, and the `reset` hook is load-bearing for `__resetIssuesCacheForTests`. Inlining duplicates the closure pattern with no clarity win.

### `app/page.tsx` magic-number `slice(0, 5)`
- Flagged: `rest.slice(0, 5)` decides "homepage shows 5 earlier issues" without a named constant.
- Decision: single-use editorial literal; `slice(0, 5)` is self-documenting and grep-able.

### `lib/site.ts` is a soft grab-bag
- Flagged: file does env-var validation, the `SITE` constants object, and URL helpers (`absoluteUrl`, `issueHref`).
- Decision: kept. The three jobs are all "site identity"; splitting into three ~10-line files adds import noise.
- Revisit when: `lib/site.ts` grows past ~80 lines

### `issueHref` placement in `lib/site.ts` rather than `lib/issues/`
- Flagged: `issueHref` is the issue route shape; semantically belongs with `lib/issues/`.
- Decision: kept. `lib/issues/` is `server-only`; moving `issueHref` requires either breaking that boundary or adding a non-server-only entry point. Wrong on principle, right in practice.

### Collapse `withResetIssuesModule` + `withMockedIssues` test helpers
- Flagged: the second helper silently requires the first to have been installed in the same describe.
- Decision: kept. Helpers work correctly and are used consistently. Collapsing into `withMockableIssues()` churns every caller for net-negative cost.
- Anchor: tests/helpers/mock-issues.ts

### Rename `IssueMeta` → `Issue`
- Flagged: every consumer treats the metadata record as *the* issue; "Meta" suggests a non-meta half.
- Decision: real concern, but a rename touches 25+ import sites for clarity-only churn.
- Revisit when: `swk` or `37z` lands — combine with that refactor

### `parsedSiteUrl` validates env, only `.host` is kept
- Flagged: `lib/site.ts` constructs a `URL` to validate the env var, then discards everything except `.host`.
- Decision: discard is intentional. Exporting `parsedSiteUrl` would invite callers to mix it with `SITE.url` (string), creating two URL shapes for the same identity.

### `TASK.md` describes the pre-split single-file layout
- Flagged: planning document references the retired single-file `lib/issues.ts`.
- Decision: `TASK.md` is a historical planning artifact. Updating to current state erases history; deleting loses the same. Current state lives in the code.

### `lib/og/index.tsx` imports + re-exports `OG_SIZE`/`getOgFonts`
- Flagged: barrel both consumes and re-exports these symbols.
- Decision: cosmetic — one duplicated line that disappears with any refactor of `renderOg`.

### `getOgFonts` test ordering claimed to mask "no I/O on import"
- Flagged: bug-finder claimed `vi.resetModules()` doesn't clear `node:fs`, so the test could pass for the wrong reason.
- Decision: rejected. `vi.resetModules()` re-evaluates `lib/og`, creating a fresh `memoize` closure with `hasValue = false`. The `fs.readFileSync` spy is installed *before* the import and would catch any module-load read.
- Anchor: tests/og.test.tsx (describe `getOgFonts`, "does not read fonts from disk on module import")

### `escapeXml` of URLs inside `<link>` / `atom:link/@href` is not "double-escape"
- Flagged: bug-finder claimed XML-escaping URLs produces `&amp;` for `&`, which "some RSS readers parse incorrectly".
- Decision: rejected. `&amp;` inside an XML element/attribute IS correct per XML 1.0; the W3C feed validator accepts it. The proposed fix (URL-encode then XML-escape) would double-encode `&` separators and break correctly encoded URLs.

### `formatIssueDate` is English-only
- Flagged: hardcoded English `MONTHS` array; no i18n.
- Decision: rejected (per bead `4sy`). `Intl.DateTimeFormat` couples build output to host ICU — minimal-ICU runtimes produce different strings. Site is `<html lang="en">`; locale-independent build *is* the feature.
- Anchor: lib/date.ts

### Loader strict-decreasing check error message claimed to "lie"
- Flagged: bug-finder claimed the comparator is "tie-stable" but the assertion enforces strict decrease.
- Decision: rejected. Code enforces "strictly decreasing in newest-first order" and the error message says exactly that. The misleading "tie-stable" phrasing was a test description and has been corrected.

### Drop `dynamic = "force-static"` everywhere under `output: "export"`
- Flagged: arch-reviewer claimed the directive is redundant globally.
- Decision: partially rejected. Next.js 16 requires `dynamic = "force-static"` on route handlers (`feed.xml/route.ts`) and metadata routes (`robots.ts`, `sitemap.ts`, `opengraph-image.tsx`) under `output: "export"` — dropping it is a build error. `dynamicParams = false` was correctly removed from page routes (per `A4`).
- Type: enforced

### `pipeline/src/http.ts` is a single-constant file
- Flagged: 2-line file exporting one `DEFAULT_USER_AGENT`; "premature module" smell.
- Decision: per bead `1ra`, the constant was hoisted out of `reddit/client.ts` so the source-agnostic enricher and the github-releases scraper don't reach into a Reddit-specific module. Named bucket for planned shared helpers (`safeText`, byte-aware truncation in `enrich/{github,html}.ts`). Inlining re-introduces the dependency cycle `1ra` fixed.
- Revisit when: planned helpers land elsewhere and this file remains a lone constant

### Selftext URL extraction is intentionally loose
- Flagged: regex doesn't strip markdown emphasis (`**url**`, `_url_`), paren-balance Wikipedia URLs, or case-normalize the `seen` dedup.
- Decision: out-of-spec markup is ~0/week on r/neovim (authors use `[name](url)` or bare URLs). A mis-parsed URL fetch-fails; the drafter ignores `fetch-failed`, and the citation pipeline can't bind to them. Tightening adds complexity for hits that don't happen.
- Anchor: pipeline/src/enrich/selftext.ts
- Revisit when: a real production fetch-failure caused by URL mis-parse appears

### GitHub releases scraper has no retry / pagination / draft filter
- Flagged: unlike the Reddit client (429/5xx retry + Retry-After), the GH-releases scraper does one `fetch` and aborts; no pagination, no `draft: true` filter.
- Decision: weekly cadence, single repo (`neovim/neovim`), one call per run. Retry duplicates work for failures that recover by re-running. Pagination irrelevant (≤5 releases/quarter; `per_page=30` covers a year). Drafts only surface with `GITHUB_TOKEN`, and output is gated by manual review before publish.
- Anchor: pipeline/src/sources/github/releases.ts
- Revisit when: scraper generalizes to multiple repos, or a release-heavy repo onboards (e.g. `q94`)

### `isAlreadyEnriched` treats `fetch-failed` as a permanent cache entry
- Flagged: any `linkedContent` presence counts as enriched, including `{ kind: "fetch-failed" }` — transient 429/5xx errors get cached.
- Decision: at weekly cadence, dead URLs vastly outnumber transient failures. Retry-on-fetch-failed would waste enrichment hitting dead links every run. Transient-failure recovery is "delete the enriched file and re-run", quarterly at most.
- Anchor: pipeline/bin/enrich-links.ts (`isAlreadyEnriched`)
- Revisit when: pipeline runs daily/hourly, or operators report repeated dead-URL re-fetches as wasteful

### CLI arg-parse triplication across `pipeline/bin/scrape-*.ts`
- Flagged: the three scrape-* CLIs repeat `parseArgs`, `parseSince`, `utcDate`, `isMain`, and the write-payload tail.
- Decision: extract on the **next** scraper, not this one. Planned next scrapers (`q94`, `jzg`, `ei7`) have meaningfully different arg shapes — extracting against three examples that don't hint at the fourth shapes a wrong abstraction.
- Anchor: pipeline/bin/scrape-reddit.ts, scrape-github-releases.ts, scrape-awesome-neovim.ts
- Revisit when: `q94`, `jzg`, or `ei7` lands — bundle with the first
- History: 2026-05-10 — `pipeline/bin/enrich-links.ts` now has its own `parseArgs` shape (filesystem probing, no `--since`). When extraction fires, decide whether `enrich-links` folds in.

### Drafter prompt does not enumerate `linkedContent: null`
- Flagged: the prompt's `linkedContent` kind union omits the `null` case the classifier's `"unknown"` branch produces.
- Decision: classifier returns `"unknown"` only for unparseable URLs or non-http(s) schemes; scrapers only emit URLs they've already fetched, so `linkedContent: null` never appears in real input. The prompt's self-check ("non-empty `linkedContent.content`") filters any pathological case.
- Anchor: pipeline/prompts/draft.md, pipeline/src/enrich/classifier.ts

### Snapshot test pinning `loadSourceContent` URL→text contract
- Flagged: design-reviewer suggested a snapshot test asserting `loadSourceContent` keys only by top-level `item.url` with non-empty `linkedContent.content`.
- Decision: the docstring on `loadSourceContent` is the contract anchor at the enforcement point, and the eval is the integration check — drift surfaces as a failed faithfulness run. A snapshot pin adds maintenance cost without an active drift signal.
- Anchor: pipeline/bin/eval-draft.ts (above `loadSourceContent`)
- Revisit when: a second prompt consumer (summary, classifier) needs the same contract

### Drop the `pnpm pipeline:eval:draft` invocation block at the end of `draft.md`
- Flagged: the block repeats the invocation in `package.json` and `next_steps.md`; the LLM never runs it.
- Decision: the block grounds the LLM's understanding of what the eval mechanically checks, which informs the self-check step. Acceptable duplication for prompt-engineering.
- Anchor: pipeline/prompts/draft.md (tail)

### Reddit-shape field access in `enrichExtras`
- Flagged: `(item as { is_self?: unknown }).is_self === true` + `selftext` in a source-agnostic enricher.
- Decision: deferred. Reddit is the only source with body-with-embedded-URLs today; github-release notes go directly to the drafter, not via "extras". The leak is two lines that disappear when a second source needs the same shape — designing the abstraction now against one example would be wrong.
- Anchor: pipeline/src/enrich/run.ts (`enrichExtras`)
- Revisit when: a non-reddit source needs body-URL extraction (HN/Lobsters comments, Mastodon)

### `mostRecentRawDate` selects dated subdirs by name pattern, not `isDirectory`
- Flagged: a regular file matching `^\d{4}-\d{2}-\d{2}$` under `pipeline/data/raw/` would be selected and downstream `readdir` would crash with ENOTDIR.
- Decision: over-defensive for a writer-controlled directory. Only the scrape-* CLIs write there, and they `mkdir` subdirectories. Loud ENOTDIR if a human stages a stray file is fine.
- Anchor: pipeline/bin/enrich-links.ts (`mostRecentRawDate`)

### `parseListing` throws on first malformed Reddit post — per-child fail-soft was rejected
- Flagged: design-reviewer suggested per-child `safeParse` with `console.warn` for misses, matching `extractTopComments` and `projectRelease` resilience.
- Decision: rejected. Bead `der` explicitly required *"a malformed listing fails with a clear schema error pointing at the broken field"* — the throw is contractual and tested. Weekly cadence + rare-by-construction Reddit shape changes mean loud failure is the right signal; silent drop would mask the upstream-drift detection `der` was filed for.
- Anchor: pipeline/src/sources/reddit/scrape.ts (`parseListing`)
- Filed: bead `der`

### Extract `parseOrThrow(schema, raw, label)` shared between `parseListing` and `parsePayload`
- Flagged: both `safeParse` and format `<path>: <message>` errors — same code, two places.
- Decision: deferred per "extract on the next caller" pattern. Wait for a third Zod-at-boundary use before designing the interface.
- Anchor: pipeline/src/sources/reddit/scrape.ts (`parseListing`), pipeline/bin/enrich-links.ts (`parsePayload`)
- Revisit when: a third Zod-at-boundary error-formatting site appears

### Reddit 12-field set triplicated across schema / `ProjectedPost` / `projectPost` literal
- Flagged: design-reviewer suggested `Omit<z.infer<typeof redditPostDataSchema>, "permalink"> & {...}` + spread.
- Decision: rejected. `redditPostDataSchema` is `.passthrough()`; a spread projection would carry Reddit's ~100 unmodeled per-post fields into raw JSON, bloating it ~8x. The explicit literal is the whitelist; the schema is the validator; the type is the contract. The test pins exactly 12 keys, so a 13th-field addition is a deliberate triplicate update.
- Anchor: pipeline/src/sources/reddit/scrape.ts, schema.ts

### Double cast from `ProjectedPost[]` to `EnrichItem[]` at the enrich boundary
- Flagged: both `tests/integration/harness.test.tsx` and `pipeline/bin/enrich-links.ts` cast `as unknown as EnrichItem[]`; root cause is `EnrichItem`'s `{ url: string; [k: string]: unknown }` not absorbing narrower typed properties.
- Decision: deferred. Cast is harmless ergonomics — every site has `url: string` by construction. Generic `enrichBatch<T extends { url: string }>` touches every enrich test, the bin script, and the harness for a readability-only win.
- Anchor: tests/integration/harness.test.tsx, pipeline/bin/enrich-links.ts

### `stubFetch` in harness test matches `api.github.com` by substring
- Flagged: would match `evil.example.com/api.github.com.html`; advised parsed `URL.hostname`.
- Decision: deferred. Internal test stub, closed fixture URL set. Tighten when promoted to a shared helper.
- Anchor: tests/integration/harness.test.tsx (`stubFetch`)

### Uniform `.passthrough()` on Reddit Zod schemas
- Flagged: design-reviewer suggested envelope schemas (`Listing`, `t3`/`t1`) be strict to catch upstream drift, keeping `.passthrough()` only on leaf payloads.
- Decision: kept uniform. Reddit envelope shape is stable across years; new envelope keys would trigger weekly failures for keys we don't read. Drift that *matters* manifests in leaf payloads — those are strict-field-presence by default and caught.
- Anchor: pipeline/src/sources/reddit/schema.ts

### Zod-at-scraper-boundary applied only to reddit
- Flagged: `github/releases.ts:projectRelease` and `awesome-neovim/scrape.ts:parseAdditions` use hand-rolled defensive parsing; pattern divergence.
- Decision: deferred. Reddit's volume (50/week, 12 fields) justified Zod; github-releases (~5/quarter, 4 fields) and awesome-neovim (narrow link-list diff) don't yet. Retrofit each when it next changes substantively; reddit is the precedent.
- Anchor: pipeline/src/sources/github/releases.ts, pipeline/src/sources/awesome-neovim/scrape.ts
- Revisit when: github-releases or awesome-neovim needs its next substantive change

### `loadSourceContent` whitespace-only `body`/`selftext`/`content` slips past `!== ""`
- Flagged: bug-finder warned `xyz !== ""` lets `"\n"` / `"   "` / `" "` index, allowing the drafter to "cite" effectively-empty source text.
- Decision: rejected. Inputs are operator-controlled (scrape-* and enrich-links write the files); GitHub release bodies are either substantive (auto-gen template or human-written) or `null`/`""`; Reddit `[removed]`/`[deleted]` selftext is the literal string, not whitespace; `fetchReadme`/`fetchArticle` produce truncated content at 65 KiB. The failure mode is self-correcting — whitespace gives the drafter nothing to cite, and the faithfulness judge would mark such a citation unfaithful anyway. Trimming adds a guard for a class of inputs that doesn't occur.
- Anchor: pipeline/bin/eval-draft.ts (`loadSourceContent`)
- Revisit when: a real production faithfulness failure traces to whitespace-only indexed source

### `loadSourceContent` extras silently overwrite top-level on URL collision
- Flagged: bug-finder + design-reviewer noted the extras loop unconditionally `urlToText.set(extra.url, extra.content)`, allowing extras to override an earlier top-level entry for the same URL with filesystem-readdir ordering.
- Decision: rejected. The within-item case is impossible (extras URLs come from selftext extraction, never the post's own `url`). The cross-item case requires the same external URL to appear as both a top-level `item.url` and an `extras[i].url` of a different post — both branches are fetching the same URL via the same enricher, so the two copies are content-equivalent modulo fetch time. Precedence choice is essentially "either, doesn't matter."
- Anchor: pipeline/bin/eval-draft.ts (extras loop)
- Revisit when: a faithfulness drift is observed for a URL that appears as both top-level and an extra in the same `enrichedDir`

### `loadSourceContent` per-file JSON.parse has no filename context on failure
- Flagged: bug-finder noted a single malformed file in `enrichedDir` blows up the run with a context-free `SyntaxError` and no indication which file failed.
- Decision: rejected. Files in `enrichedDir` are operator-controlled (only scrape-*/enrich-links write them, both via atomic-ish single writes). Half-write requires process kill mid-write; mis-edit is recoverable in 30 seconds by `ls -lt`. Defensive wrapping for a failure that essentially doesn't happen in single-operator weekly cadence isn't worth the 4 lines.
- Anchor: pipeline/bin/eval-draft.ts (`loadSourceContent` JSON.parse)

### `loadSourceContent` mixed discriminator-vs-structural keying across four shapes
- Flagged: design-reviewer suggested lifting each of the four indexing branches (`linkedContent.content`, `github-release` body, `is_self` selftext, `linkedContentExtras`) to named local indexers or `{key, text}` candidates, since each uses a different gating signal in one tight block.
- Decision: deferred per "extract on the next caller" pattern. Four shapes is the current ceiling; a fifth would tip the design toward named indexers. The current ~30 lines are readable and the four-way contract is anchored in the docstring above the function.
- Anchor: pipeline/bin/eval-draft.ts (`loadSourceContent`, lines 196-233)
- Revisit when: a fifth citable shape lands

### `loadSourceContent` Reddit selftext keyed by `permalink` while other branches key by `url`
- Flagged: design-reviewer noted the selftext branch keys by `item.permalink` (asymmetric with the github-readme / github-release branches which key by `item.url`), relying on the contract `permalink === item.url` for self-posts.
- Decision: kept. The equality is a property of the Reddit projection (`projectPost` builds the permalink, and self-posts have `url = permalink`); the prompt tells the LLM either form works; the test pins the key choice. Inserting both keys is belt-and-suspenders against a Reddit API decoupling that has no precedent.
- Anchor: pipeline/bin/eval-draft.ts (`loadSourceContent`, lines 213-219)

### `loadSourceContent` extras gate is structural (`typeof content === "string"`) while prompt gate is by kind whitelist
- Flagged: bug-finder noted the prompt requires extras `kind ∈ { github-readme, html-article }` while the code only checks `typeof extra.content === "string"`. Functionally equivalent today (only those two `EnrichedLink` variants set a string `content`); the two gates could drift.
- Decision: kept. The code's structural check is the actual contract ("if it has string content, it's indexable"); the prompt's kind whitelist is the LLM-facing description of which kinds produce that content. Adding a kind gate in code is redundant typing — a future `EnrichedLink` variant adding string `content` would also need a prompt update, and the bug-finder check would catch it then.
- Anchor: pipeline/bin/eval-draft.ts (extras loop), pipeline/prompts/draft.md (extras rules)
