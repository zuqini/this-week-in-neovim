# Skipped review findings

Findings from the 2026-05-03 multi-agent review (`/arch-review` + `/review`) that
were investigated but **not fixed**. Each entry names the source of the finding,
summarizes it, and gives the reason it was deferred or rejected.

## Deferred — large refactors, premature, or already tracked elsewhere

### CR-1 / P3-3 — Per-slug dynamic MDX import is a scaling cliff
`components/issue-body.tsx → lib/issues/body.ts:8`. Webpack bundles every MDX
file under `content/issues/` as its own async chunk. At ~50–200 issues, this
will dominate build time and `.next/` size.

**Why skipped:** already tracked as `swk` in beads (deferred per commit
`2842207` — re-evaluate at ~20 issues). At one issue today, it is not a
problem. The fix (precompile MDX to HTML strings at build time) is a
non-trivial migration that should be paired with `dr9` (RSS `content:encoded`).

### CR-2 — Render-shape layer between schema and renderers
The audit observed that downstream renderers (feed, OG, MDX anchor, root
metadata, per-issue metadata) each implement their own output policies
(truncation, XML codepoint allowlist, host detection) without a shared
`RenderableIssue` / `OgPayload` projection.

**Why skipped:** premature with current call counts. There is exactly one OG
card variant per shape, one feed renderer, and two metadata sites. Extracting a
"render-shape layer" before a third caller appears would add indirection
without consolidating real duplication. Will revisit when a third metadata
site (e.g. tag pages, Atom feed, JSON feed) lands.

### CR-3 / Struct #6 — `getAllIssues` singleton + `process.cwd` coupling
`lib/issues/index.ts:7` reads `process.cwd()` at module load and `getAllIssues`
remains a memoized singleton. The 37z follow-up wanted to retire this in favor
of passing `IssueMeta[]` from a composition root.

**Why skipped:** already tracked as `37z` in beads. Real fix is a multi-route
refactor (every consumer changes) plus a new `app/_data.ts` composition root.
Out of scope for a polish pass — would land cleaner in the same PR as the MDX
precompile work (`swk`), which has overlapping touch points.

### A1 / Design #9 — Dedupe metadata assembly
`app/layout.tsx` and `app/issues/[slug]/page.tsx` both construct `openGraph` +
`twitter` objects with overlapping fields.

**Why skipped:** the duplication is structural (both have a `summary_large_image`
twitter card with title+description) but the *content* differs (root is
`type: "website"` with `SITE.name`; per-issue is `type: "article"` with
`issue.title` + `publishedTime`). Extracting a helper for two callers with
disjoint inputs would take 5+ parameters and not collapse meaningfully. Defer
until a third route (tag pages) creates real triplicate.

### A5 — Unreachable `notFound()` in opengraph-image
`app/issues/[slug]/opengraph-image.tsx`'s `if (!issue) notFound()` is
unreachable because `generateStaticParams` is the closed set.

**Why skipped:** the defensive branch is harmless and removing it forces a
non-null assertion (`issue!`) or a redundant assert helper. The current shape
satisfies TypeScript without ceremony. Net cost-of-change > benefit.

### A7 — Sitemap floor date hardcoded
`SITE_FLOOR_DATE = "2026-05-01"` is a literal in `app/sitemap.ts`.

**Why skipped:** editorial product decision (the launch date is fixed). Moving
to env-var or to "oldest issue date" changes semantics without a stated
requirement. Leave as a single literal that any contributor can grep for.

### A9 — OG gradient hardcoded outside PALETTE
`lib/og/cards.tsx:18` inlines `linear-gradient(135deg, ...)` with hardcoded
angle and stop positions.

**Why skipped:** premature with two cards. Token-izing the gradient now would
introduce an abstraction with one shape. Revisit if a third card variant needs
a different gradient.

### A10 — `when: () => process.env.NODE_ENV === "production"` toggle obscures intent
`lib/issues/index.ts:10` predicate name "production" hides the intent ("cache
during static export, never during dev/test so HMR sees content edits").

**Why skipped:** the predicate is local to one call site. Wrapping in
`memoInProd(...)` adds another layer of indirection, and inlining the
predicate as a local helper buys nothing. The current call site is short and
the JSDoc on `memoize` covers it. Would be worth revisiting if a third caller
appears with a different policy.

### Design #1 — Pattern divergence between `lib/issues/` and `lib/og/`
`lib/issues/index.ts` houses the memoized accessor; `lib/og/fonts.ts` houses
its memoized accessor. Different conventions across two parallel domains.

**Why skipped:** placement is defensible for both. `getAllIssues` is the public
API of `lib/issues` so it lives in the barrel; `getOgFonts` is mostly an
internal implementation detail of `lib/og` (only `renderOg` calls it directly)
so it lives next to its dependency. Not worth churning either to match the
other.

### Design #2 — `memoize` over-abstracted for two callers
`lib/memo.ts` is a generic memoize with a `when` predicate, used twice.

**Why skipped:** with the CR-4 sentinel fix landed, `memo.ts` is 22 lines and
clearly correct. Inlining the closure pattern into both call sites would add
duplicate code with no clarity win, and removes the `reset` hook that the
test suite uses (`__resetIssuesCacheForTests`). Generic shape is fine.

### Design #6 — `app/page.tsx` magic 5
`const earlier = rest.slice(0, 5)` decides "homepage shows 5 earlier issues".

**Why skipped:** single-use editorial constant. Extracting to a domain helper
or `lib/site.ts` for one caller adds indirection without consolidating real
duplication. The literal is grep-able and the `slice(0, 5)` shape is
self-documenting at the call site.

### Design #7 — `lib/site.ts` is a "soft grab-bag"
38-line file does env-var validation, the `SITE` constants object, and URL
helpers (`absoluteUrl`, `issueHref`).

**Why skipped:** the three jobs are tightly related (all "site identity")
and the file is small. Splitting into three files of ~10 lines each adds
import noise without clarifying anything. Revisit if `lib/site.ts` grows past
~80 lines.

### Design #8 — `issueHref` lives in `lib/site.ts`, not in the issues domain
`issueHref(slug)` is the issue route shape; semantically it belongs with
`lib/issues/`.

**Why skipped:** moving it would require either (a) breaking the `server-only`
boundary on `lib/issues/` so client components can call it, or (b) creating a
non-server-only entry point under `lib/issues/`. Both add structural cost. The
current placement is wrong on principle but works correctly and ships across
the entire client-render layer without ceremony.

### Design #11 — Collapse `withResetIssuesModule` + `withMockedIssues`
The two helpers in `tests/helpers/mock-issues.ts` are partial — the second
silently requires the first to have been installed in the same describe.

**Why skipped:** the helpers are local to test files, work correctly, and are
called consistently across `app-routes.test.tsx`. Collapsing into a single
`withMockableIssues()` helper would force every caller site to change. Net
cost > benefit at the current scale.

### Design #13 — `IssueMeta` naming is misleading
The audit suggested renaming to `Issue` since every consumer treats the
metadata record as *the* issue.

**Why skipped:** rename touches 25+ import sites and the test suite. The
naming concern is real (the body is loaded separately, "Meta" suggests there's
a "non-meta" half) but the disruption is large for a clarity-only change.
Defer to the same refactor as `swk`/`37z` if either lands.

### Design #15 — `parsedSiteUrl` only host kept
`lib/site.ts:6` constructs a `URL` to validate the env var, then discards
everything except `.host`.

**Why skipped:** the discard is intentional — `URL` is the right
validation primitive but the rest of the codebase uses `SITE.url` (string)
and `SITE_HOST` (string). Exporting `parsedSiteUrl` would invite new callers
to mix it with `SITE.url`, creating two slightly different URL shapes.

### Struct #1 — `TASK.md` is stale
The Phase-1 planning document at `TASK.md:61-63` describes the pre-split
single-file `lib/issues.ts` layout.

**Why skipped:** `TASK.md` is a Phase-1 planning artifact, not a current-state
document. Its purpose is historical (what we were going to build, what
trade-offs we considered). Updating it to current state would erase that
history; deleting it would lose the same. Best left as-is. Current-state
documentation lives in the code itself.

### Struct #5 — `lib/og/index.tsx` re-export pattern
The barrel imports `OG_SIZE`/`getOgFonts` for use inside `renderOg` and
also re-exports them from `./fonts`.

**Why skipped:** cosmetic. The current shape works correctly and the
duplication is a single line that disappears with any refactor of `renderOg`.

## Rejected — finding does not hold or is intended behavior

### P1-6 — `getOgFonts` test ordering supposedly masks "no I/O on import"
The bug-finder claimed `tests/og.test.tsx:68-74` could pass for the wrong
reason because `vi.resetModules()` doesn't clear `node:fs` cache.

**Why rejected:** `vi.resetModules()` resets the ESM module graph for `lib/og`,
which re-evaluates the module body and creates a fresh `memoize` closure with
`hasValue = false` (post-CR-4). The `fs.readFileSync` spy installed *before*
the import would catch any read at module-load. The test is correct.

### P2-1 / P2-7 — `escapeXml` inside `<link>` and `atom:link` href is "double-escape"
The bug-finder noted that XML-escaping URLs in `<link>` produces `&amp;` for
URLs containing `&`, which some RSS readers parse incorrectly.

**Why rejected:** `&amp;` inside an XML element/attribute *is* the correct
encoding per the XML 1.0 spec. RSS readers that trip on this are buggy; the
W3C feed validator accepts `&amp;` in `<link>` and `atom:link/@href`. The
fix described (URL-encode then XML-escape) would actually break correctly
encoded URLs by encoding the `&` separator twice. No-op.

### P3-1 — `formatIssueDate` is English-only
`lib/date.ts:3-16` uses a hardcoded English `MONTHS` array.

**Why rejected:** intentional, per the `4sy` follow-up that landed it. Using
`Intl.DateTimeFormat` would couple the build output to host ICU behavior
(different builds produce different date strings on minimal-ICU runtimes).
The whole site is `<html lang="en">` — locale-independence is the feature.

### P1-1 — Loader strict-decreasing check error message "lies"
The bug-finder claimed the comparator is "tie-stable" but the assertion
enforces strict decrease.

**Why rejected:** the error message says "Issue numbers must be strictly
decreasing in newest-first order" — which is exactly what the code enforces.
The test description was the only artifact saying "tie-stable" and that has
been updated to "strictly decreasing".

### A3 (partial) / Struct #4 — Drop `dynamic = "force-static"` everywhere
The architecture review claimed the directive is redundant globally with
`output: "export"`.

**Why partially rejected:** verified by attempting to drop them — Next.js 16
explicitly **requires** `dynamic = "force-static"` on route handlers
(`app/feed.xml/route.ts`) and metadata routes (`robots.ts`, `sitemap.ts`,
both `opengraph-image.tsx`) under `output: "export"`. Dropping it produces a
build-time error. The directive was correctly retained on these files.
`dynamicParams = false` was however removed from page routes where it is
genuinely redundant (per A4).
