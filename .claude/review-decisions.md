# Review decisions

Accepted tradeoffs reviewers should not re-flag. Before adding an entry, search for an existing one and append to its `History:` instead.

Schema: `title` / `Flagged` / `Decision` (required); `Type` / `Anchor` / `Filed` / `History` / `Revisit when` (optional). Full lifecycle in `~/.claude/skills/review/SKILL.md`.

Seeded from the 2026-05-03 multi-agent review (`/arch-review` + `/review`).

## Recurring false flags

<!-- Promote entries here once they've been raised on separate passes by different reviewers/agents. -->

## Decisions

### Per-slug dynamic MDX import is a scaling cliff
- Flagged: webpack bundles every MDX file under `content/issues/` as its own async chunk; build-time/`.next/` cliff at 50–200 issues.
- Decision: deferred. At one issue today, not a problem. The fix (precompile MDX to HTML strings at build time) is a non-trivial migration that should be paired with `dr9` (RSS `content:encoded`).
- Anchor: components/issue-body.tsx, lib/issues/body.ts:8
- Filed: beads `swk` (deferred per commit 2842207)
- Revisit when: ~20 issues exist

### Render-shape projection layer between schema and renderers
- Flagged: feed, OG, MDX anchor, root metadata, and per-issue metadata each implement their own output policies (truncation, XML codepoint allowlist, host detection) without a shared `RenderableIssue`/`OgPayload` projection.
- Decision: premature with current call counts — one OG card per shape, one feed renderer, two metadata sites. Extracting a render-shape layer before a third caller appears would add indirection without consolidating real duplication.
- Revisit when: a third metadata site lands (tag pages, Atom feed, JSON feed)

### `getAllIssues` singleton + `process.cwd` coupling
- Flagged: `lib/issues/index.ts:7` reads `process.cwd()` at module load; `getAllIssues` is a memoized singleton.
- Decision: deferred. Real fix is a multi-route refactor (every consumer changes) plus a new `app/_data.ts` composition root. Out of scope for a polish pass — would land cleaner in the same PR as the MDX precompile work, which has overlapping touch points.
- Anchor: lib/issues/index.ts:7
- Filed: beads `37z`
- Revisit when: `swk` lands

### Dedupe `openGraph`/`twitter` metadata between root and per-issue layouts
- Flagged: `app/layout.tsx` and `app/issues/[slug]/page.tsx` both construct `openGraph` + `twitter` objects with overlapping fields.
- Decision: duplication is structural but content differs — root is `type: "website"` with `SITE.name`; per-issue is `type: "article"` with `issue.title` + `publishedTime`. A helper for two callers with disjoint inputs would take 5+ parameters and not collapse meaningfully.
- Revisit when: a third route (tag pages) creates real triplicate

### Unreachable `notFound()` in `opengraph-image.tsx`
- Flagged: `if (!issue) notFound()` is unreachable because `generateStaticParams` returns the closed set.
- Decision: defensive branch is harmless; removing it forces a non-null assertion (`issue!`) or a redundant assert helper. The current shape satisfies TypeScript without ceremony.
- Anchor: app/issues/[slug]/opengraph-image.tsx

### `SITE_FLOOR_DATE` hardcoded in `app/sitemap.ts`
- Flagged: literal `"2026-05-01"` rather than env var or "oldest issue date".
- Decision: editorial product decision — launch date is fixed. Moving to env or computed semantics without a stated requirement. Leave as a single literal that any contributor can grep for.
- Anchor: app/sitemap.ts

### OG gradient inlined outside `PALETTE`
- Flagged: `linear-gradient(135deg, ...)` with hardcoded angle and stops.
- Decision: premature with two cards. Token-izing the gradient now would introduce an abstraction with one shape.
- Anchor: lib/og/cards.tsx:18
- Revisit when: a third card variant needs a different gradient

### `memoize`'s `when: () => process.env.NODE_ENV === "production"` predicate
- Flagged: predicate name "production" hides the intent ("cache during static export, never during dev/test so HMR sees content edits").
- Decision: predicate is local to one call site. Wrapping in `memoInProd(...)` adds indirection; inlining buys nothing. JSDoc on `memoize` covers the intent.
- Anchor: lib/issues/index.ts:10
- Revisit when: a third caller appears with a different policy

### Memoized-accessor placement differs between `lib/issues/` and `lib/og/`
- Flagged: `getAllIssues` lives in the `lib/issues` barrel (public API); `getOgFonts` lives next to its dependency in `lib/og/fonts.ts` (internal detail). Pattern divergence across two parallel domains.
- Decision: placement is defensible for both. `getAllIssues` is the public API of `lib/issues`; `getOgFonts` is mostly an internal implementation detail (only `renderOg` calls it). Not worth churning either to match the other.

### `lib/memo.ts` is over-abstracted for two callers
- Flagged: generic `memoize` with a `when` predicate, used twice.
- Decision: 22 lines and clearly correct. Inlining the closure pattern into both call sites would add duplicate code with no clarity win, and removes the `reset` hook the test suite uses (`__resetIssuesCacheForTests`). Generic shape is fine.
- Anchor: lib/memo.ts

### `app/page.tsx` magic-number `slice(0, 5)`
- Flagged: `const earlier = rest.slice(0, 5)` decides "homepage shows 5 earlier issues".
- Decision: single-use editorial constant. Extracting to a domain helper or `lib/site.ts` for one caller adds indirection without consolidating real duplication. The literal is grep-able and the `slice(0, 5)` shape is self-documenting at the call site.
- Anchor: app/page.tsx

### `lib/site.ts` is a soft grab-bag
- Flagged: 38-line file does env-var validation, the `SITE` constants object, and URL helpers (`absoluteUrl`, `issueHref`).
- Decision: the three jobs are tightly related (all "site identity") and the file is small. Splitting into three ~10-line files adds import noise without clarifying anything.
- Revisit when: `lib/site.ts` grows past ~80 lines

### `issueHref` placement in `lib/site.ts` rather than `lib/issues/`
- Flagged: `issueHref(slug)` is the issue route shape; semantically it belongs with `lib/issues/`.
- Decision: moving it would require either breaking the `server-only` boundary on `lib/issues/` so client components can call it, or creating a non-server-only entry point under `lib/issues/`. Both add structural cost. The current placement is wrong on principle but works correctly across the entire client-render layer without ceremony.

### Collapse `withResetIssuesModule` + `withMockedIssues` test helpers
- Flagged: helpers are partial — the second silently requires the first to have been installed in the same describe.
- Decision: helpers are local to test files, work correctly, and are called consistently across `app-routes.test.tsx`. Collapsing into a single `withMockableIssues()` would force every caller site to change. Net cost > benefit at the current scale.
- Anchor: tests/helpers/mock-issues.ts

### Rename `IssueMeta` → `Issue`
- Flagged: every consumer treats the metadata record as *the* issue; "Meta" suggests a non-meta half.
- Decision: real concern, but rename touches 25+ import sites and the test suite. Disruption is large for a clarity-only change.
- Revisit when: `swk` or `37z` lands — combine with that refactor

### `parsedSiteUrl` validates env, only `.host` is kept
- Flagged: `lib/site.ts:6` constructs a `URL` to validate the env var, then discards everything except `.host`.
- Decision: discard is intentional. `URL` is the right validation primitive but the rest of the codebase uses `SITE.url` (string) and `SITE_HOST` (string). Exporting `parsedSiteUrl` would invite new callers to mix it with `SITE.url`, creating two slightly different URL shapes.
- Anchor: lib/site.ts:6

### `TASK.md` describes the pre-split single-file layout
- Flagged: Phase-1 planning document references the retired single-file `lib/issues.ts`.
- Decision: `TASK.md` is a Phase-1 planning artifact, not a current-state document. Its purpose is historical. Updating it to current state would erase that history; deleting loses the same. Current-state documentation lives in the code itself.
- Anchor: TASK.md:61-63

### `lib/og/index.tsx` imports + re-exports `OG_SIZE`/`getOgFonts`
- Flagged: barrel both consumes these symbols inside `renderOg` and re-exports them from `./fonts`.
- Decision: cosmetic. The duplication is a single line that disappears with any refactor of `renderOg`.

### `getOgFonts` test ordering claimed to mask "no I/O on import"
- Flagged: bug-finder claimed `tests/og.test.tsx:68-74` could pass for the wrong reason because `vi.resetModules()` doesn't clear `node:fs` cache.
- Decision: rejected. `vi.resetModules()` resets the ESM module graph for `lib/og`, which re-evaluates the module body and creates a fresh `memoize` closure with `hasValue = false` (post-CR-4). The `fs.readFileSync` spy installed *before* the import would catch any read at module-load. The test is correct.
- Anchor: tests/og.test.tsx:68-74

### `escapeXml` URLs inside `<link>` and `atom:link/@href` are not "double-escape"
- Flagged: bug-finder claimed XML-escaping URLs produces `&amp;` for `&`, which "some RSS readers parse incorrectly".
- Decision: rejected. `&amp;` inside an XML element/attribute *is* the correct encoding per the XML 1.0 spec. The W3C feed validator accepts `&amp;` in `<link>` and `atom:link/@href`. The proposed fix (URL-encode then XML-escape) would double-encode the `&` separator and actually break correctly encoded URLs.

### `formatIssueDate` is English-only
- Flagged: `lib/date.ts:3-16` uses a hardcoded English `MONTHS` array; no i18n.
- Decision: rejected — intentional, per the `4sy` follow-up that landed it. Using `Intl.DateTimeFormat` would couple the build output to host ICU behavior (different builds produce different date strings on minimal-ICU runtimes). The site is `<html lang="en">` — locale-independence is the feature.
- Anchor: lib/date.ts:3-16

### Loader strict-decreasing check error message claimed to "lie"
- Flagged: bug-finder claimed the comparator is "tie-stable" but the assertion enforces strict decrease.
- Decision: rejected. The error message says "Issue numbers must be strictly decreasing in newest-first order" — which is exactly what the code enforces. The misleading "tie-stable" phrasing was only in a test description and has been corrected to "strictly decreasing".

### Drop `dynamic = "force-static"` everywhere under `output: "export"`
- Flagged: arch-reviewer claimed the directive is redundant globally.
- Decision: partially rejected. Next.js 16 explicitly **requires** `dynamic = "force-static"` on route handlers (`app/feed.xml/route.ts`) and metadata routes (`robots.ts`, `sitemap.ts`, both `opengraph-image.tsx`) under `output: "export"`; dropping it produces a build-time error. The directive was correctly retained on these files. `dynamicParams = false` was removed from page routes where it is genuinely redundant (per A4).
- Type: enforced

### `pipeline/src/http.ts` is a single-constant file
- Flagged: 2-line file exporting one `DEFAULT_USER_AGENT` constant; "premature module" smell.
- Decision: explicitly per `1ra`'s scope — the constant was moved out of `pipeline/src/sources/reddit/client.ts` so the source-agnostic enricher and the new github-releases scraper don't reach into a Reddit-specific module. The file is a named bucket for future shared HTTP helpers (`safeText`, byte-aware truncation in `enrich/{github,html}.ts`). Splitting into per-helper files would re-introduce the dependency cycle 1ra fixed.
- Anchor: pipeline/src/http.ts
- Revisit when: the file shrinks back to one symbol after the listed helpers move elsewhere

### Selftext URL extraction is intentionally loose
- Flagged: regex in `pipeline/src/enrich/selftext.ts` doesn't strip markdown emphasis (`**url**`, `_url_`, `~url~`), doesn't paren-balance Wikipedia-style URLs, doesn't case-normalize the `seen` dedup.
- Decision: out-of-spec selftext markup is vanishingly rare on r/neovim (plugin authors use `[name](url)` or bare URLs). A malformed bare URL fetch-fails gracefully; the drafter ignores `fetch-failed` items and the eval/citation pipeline can't bind to them anyway. Tightening the regex adds complexity for ~0 expected hits/week on a weekly-cadence newsletter.
- Anchor: pipeline/src/enrich/selftext.ts:3-5
- Revisit when: a real fetch-failure caused by URL mis-parse appears in production output

### GitHub releases scraper has no retry / pagination / draft filter
- Flagged: unlike `pipeline/src/sources/reddit/client.ts` (which has 429/5xx retry + Retry-After), `pipeline/src/sources/github/releases.ts` does one `fetch` and aborts on transient failure. No pagination. No `draft: true` filter.
- Decision: weekly cadence, single repo (`neovim/neovim`), one HTTP call per run. Adding retry duplicates work for failures that recover by re-running the CLI a minute later. Pagination is irrelevant — Neovim posts ≤ 5 releases per quarter; `--per-page=30` covers a year. Drafts only surface with an authenticated `GITHUB_TOKEN`; the pipeline output is gated by manual review before publishing, so a draft leak is editorial-not-security.
- Anchor: pipeline/src/sources/github/releases.ts:54-65
- Revisit when: the scraper is generalized to multiple repos OR a release-heavy repo (plugin author feeds, `q94`) gets onboarded

### `isAlreadyEnriched` treats `fetch-failed` as a permanent cache entry
- Flagged: `pipeline/bin/enrich-links.ts:70-72` returns true whenever `linkedContent` is present, including `{ kind: "fetch-failed" }`. Transient 429/5xx errors get baked into the cached output and never retried.
- Decision: at weekly cadence, dead URLs vastly outnumber transient failures. A "retry on fetch-failed" default would waste enrichment time hitting dead links on every run. Operators who see a transient failure can delete the enriched file and re-run; that's once per quarter at most.
- Anchor: pipeline/bin/enrich-links.ts:70-72
- Revisit when: the pipeline runs daily or hourly, or operators report repeated dead-URL re-fetches as wasteful

### CLI arg-parse triplication across `pipeline/bin/scrape-*.ts`
- Flagged: `scrape-reddit.ts`, `scrape-github-releases.ts`, `scrape-awesome-neovim.ts` each repeat `parseArgs`, `parseSince`, `utcDate`, `isMain` detection, and the write-payload tail.
- Decision: extract on the **next** scraper, not this one. Three call sites is the threshold where extraction starts paying off, but the planned next scrapers (`q94` plugin-author feeds, `jzg` GH Search, `ei7` HN/Lobsters) each have meaningfully different arg shapes, so the helper's interface isn't obvious yet. Premature extraction now would force an early-and-wrong abstraction.
- Anchor: pipeline/bin/scrape-reddit.ts, pipeline/bin/scrape-github-releases.ts, pipeline/bin/scrape-awesome-neovim.ts
- Revisit when: `q94`, `jzg`, or `ei7` lands — bundle the extraction with the first one

### Reddit-shape field access in `enrichExtras`
- Flagged: `pipeline/src/enrich/run.ts:63-65` does `(item as { is_self?: unknown }).is_self === true` + `selftext` — a reddit-specific field cast inside a source-agnostic enricher.
- Decision: deferred. Today reddit is the only source with a body-with-embedded-URLs shape; github-release notes live in `item.body` and are consumed directly by the drafter, not as enricher "extras". Generalizing prematurely (e.g., an `extraSourceText?: string` field on `EnrichItem` set by each projector) would design the abstraction with one example. The cast is ugly but localized — the leak is two lines that disappear when a second source needs the same treatment.
- Anchor: pipeline/src/enrich/run.ts:58-79
- Revisit when: a non-reddit source needs body-URL extraction (e.g., HN/Lobsters comments, Mastodon posts)
