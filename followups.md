# Follow-ups from 2026-05-03 architecture + code review

Tracking 31 beads issues filed after the multi-agent review (`/arch-review` + `/review`). Each section gives the **why**, the **where**, and a concrete **how** so any contributor can pick one up. Run `bd show <id>` for the canonical record.

## Suggested sequencing

1. **Critical correctness** (P0): one PR — small surgical edits, low risk.
2. **Convergent design fixes** (`bjb`, `fns`, `u4a`, `o1p`): one PR each, ~50–150 LOC.
3. **Consolidation pass** (`61s`, `us0`, `ath`, `c6y`, `37z`): pairs nicely with the splits since it touches the same modules.
4. **Polish + scaling** (P3): backlog when convenient.

Dependency edges already wired in beads:

- `dr9` (content:encoded) ← `swk` (MDX precompile)
- `pi9` (move loadIssueBody) ← `u4a` (split issues.ts)
- `k5p` (consolidate tests) ← `37z` (retire singleton)
- `r9w` (truncate OG title) ← `o1p` (split og.tsx)

---

## P0 — Critical correctness (5)

### `cuw` — public/_headers overrides RSS Content-Type on edge

`public/_headers:2` sets `application/xml; charset=utf-8` for `/feed.xml`, silently overriding the route handler at `app/feed.xml/route.ts:9` which sets `application/rss+xml; charset=utf-8`. Cloudflare Pages applies `_headers` at the edge, so the route's hardened Content-Type is lost.

- Edit `public/_headers` lines 1–3 to use `application/rss+xml; charset=utf-8`, OR remove the override and let the route header pass through.
- While there, confirm `/sitemap.xml` Content-Type matches what `app/sitemap.ts` emits.

### `236` — Delete or implement orphan valid-long-title.mdx fixture

`tests/fixtures/parser/valid/valid-long-title.mdx:1-5` claims "Long title triggers a console.warn for OG card clamping." No such code exists in `lib/issues.ts`; no test loads the fixture (zero grep hits).

- Either delete the fixture, OR implement the warn and add a test that loads it. Pick one and close the loop.

### `v1b` — escapeXml leaks XML 1.0 noncharacters

`lib/feed.ts:14-25` uses a regex that catches lone surrogates, BMP `U+FFFE/FFFF`, and XML metas — but **misses** `U+FDD0–U+FDEF` and the 32 noncharacters at the end of every supplementary plane (`U+1FFFE/F` … `U+10FFFE/F`). RSS/Atom validators reject these. The literal `[￾￿]` in regex source is also editor-stability fragile.

- Replace the regex-replace with a code-point allowlist. Iterate by code point via `String.prototype.codePointAt`, keeping `\x09 \x0A \x0D`, `0x20–0xD7FF`, `0xE000–0xFFFD`, `0x10000–0x10FFFF` minus `0xFDD0–0xFDEF` and `*FFFE/F`.
- Use explicit `\uXXXX` escapes in the source — never literal noncharacters.
- Add a fixture with each noncharacter class to the snapshot test.

### `bin` — YAML 1.1 frontmatter parses "No" / "Yes" / "On" as booleans

`gray-matter` defaults to YAML 1.1 via `js-yaml`'s legacy schema. A title `No clobber` parses as the boolean `false`, failing `z.string()` with a confusing message. Bare `01:23` parses sexagesimal. Affects `parseIssueMeta` at `lib/issues.ts:42-51`.

- Pass `{ engines: { yaml: ... } }` to `gray-matter` using the spec-compliant `yaml` (1.2) parser, OR pre-validate that all frontmatter values are strings before Zod.
- Add a fixture exercising `title: No`.

### `rcc` — Tighten loadIssueBody slug regex

`lib/issues.ts:122` uses `/^[\w-]+$/`, which accepts `__proto__`, leading underscores, and arbitrarily long names — looser than the actual slug shape produced by `loadIssuesFromDir`. Defense-in-depth.

- Change to `/^\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/`.

---

## P1 — High (7)

### `bjb` — Align per-slug OG handler to notFound()

`app/issues/[slug]/opengraph-image.tsx:23-34` falls back to Issue #0 with empty date when `getIssueBySlug` returns null. With `dynamicParams = false`, that branch is unreachable — the defensive fallback is silently dishonest. The sibling page route correctly calls `notFound()`.

- Replace the `?.` chain with `notFound()` (or assert non-null after the lookup) so the impossible case is impossible by type.

### `fns` — Resolve palette drift between lib/theme.ts and app/globals.css

`app/globals.css:19` carries the comment `mirror lib/theme.ts PALETTE` and then defines tokens (`--fg`, `--accent-bg`, `--link`, `--border-color`, `--muted`) that have no counterpart in `lib/theme.ts:1-10`. Also `lib/og.tsx:59` hardcodes `#0b151b` inline.

Pick one source-of-truth and follow through:

- (preferred) generate CSS custom properties from `PALETTE` via Tailwind v4 `@theme`;
- shrink `theme.ts` to OG-only constants the server-rendered OG card actually needs;
- at minimum, add a unit test that asserts both files agree, so drift fails fast.

### `u4a` — Split lib/issues.ts into schema/loader/index modules

127-line file owns: Zod schema, parsing, FS traversal, generic `memoize` helper, public API, test reset hook. The generic memoize next to schema definitions is the most jarring.

Target shape:

- `lib/issues/schema.ts` — `SourceSchema`, `FrontmatterSchema`, `parseIssueMeta`, types.
- `lib/issues/loader.ts` — `loadIssuesFromDir` (pure of memoization).
- `lib/issues/index.ts` — public API: `getAllIssues`, `getIssueBySlug`, `getAdjacent`, `getIssueSlugs`, plus the cached singleton + `__resetIssuesCacheForTests`.
- Move `memoize` to `lib/memo.ts` (or inline it in `index.ts` if it's the only call site).

After this lands, do `pi9` to move `loadIssueBody` out as well.

### `o1p` — Split lib/og.tsx; add renderOg helper

195-line file mixes server-only filesystem font I/O + a singleton cache (lines 1–50) with pure presentational components (52–195). Two route files redo `ImageResponse` assembly themselves.

- Split into `lib/og/fonts.ts` (server-only I/O + cache, using shared `memoize`) and `lib/og/cards.tsx` (pure components, testable via `renderToStaticMarkup` without filesystem access).
- Add `renderOg(card)` returning an `ImageResponse` configured with `OG_SIZE` + fonts. Both route files (`app/opengraph-image.tsx`, `app/issues/[slug]/opengraph-image.tsx`) collapse to: build the card element, call `renderOg(...)`.

### `4sy` — formatIssueDate: replace toLocaleDateString with manual format

`lib/date.ts:12-19` uses `Intl.DateTimeFormat`, which depends on host ICU. Minimal-ICU runtimes (some Alpine/Docker images, some Lambda) silently degrade `en-US` to `5/4/2026`, breaking `tests/app-routes.test.tsx:146` and producing non-deterministic SSG output across build hosts.

- Format manually from `Date.UTC` parts with a hardcoded month-name array. Removes the ICU dependency entirely.

### `7k6` — Validate SITE.url at module load

`lib/site.ts:8` reads `NEXT_PUBLIC_SITE_URL` with a default. If the env var lacks a scheme (common mistake), `siteHost()` and `metadataBase: new URL(SITE.url)` (`app/layout.tsx:8`) throw at module load, failing the build with a stack trace pointing at the layout, not the env var.

- Validate `new URL(SITE.url)` once at module load; throw a clear error naming the env var when invalid.

### `zg9` — mdx-components.tsx isExternal: fail closed

`mdx-components.tsx:5-13` returns `false` on URL parse failure, downgrading malformed hrefs to internal links — losing `target=_blank` / `noreferrer` / `noopener`.

- On parse failure, return `true` (treat as external) — internal-vs-external should fail closed. Or, since MDX is build-time content, throw at build.

---

## P2 — Medium (9)

### `61s` — Move slug↔date invariant into parseIssueMeta

`lib/issues.ts:62-67` cross-checks frontmatter date against filename slug only inside `loadIssuesFromDir`. `parseIssueMeta` is exported and could be called from other contexts where the invariant is silently skipped.

- Move the check into `parseIssueMeta` (it has both `slug` and `meta.date` already). Leave `loadIssuesFromDir` as: list → read → parse → drop drafts → sort.

### `us0` — Move SITE_FLOOR_DATE into app/sitemap.ts

`SITE_FLOOR_DATE` is exported from `lib/site.ts` but used only by `app/sitemap.ts`. It also forces `lib/site.ts` to import from `lib/date.ts` — wrong dependency direction (config depending on date util).

- Inline or move into `app/sitemap.ts`. `lib/site.ts` becomes pure config + URL helpers with no internal deps.

### `ath` — Extract getIssueRouteParams to dedupe generateStaticParams

`app/issues/[slug]/page.tsx:15-17` and `app/issues/[slug]/opengraph-image.tsx:13-15` are byte-equivalent. If they ever drift (e.g., one filters drafts), the static export produces orphan pages or orphan OG images.

- Extract `getIssueRouteParams` to `lib/issues` and call from both.

### `c6y` — Extract <IssueHeader> component

`app/page.tsx:30-49` and `app/issues/[slug]/page.tsx:57-69` contain near-identical "issue number + date + title + summary" markup. `components/issue-card.tsx` provides a row component but no headline.

- Extract `<IssueHeader issue={...} />`; both pages collapse to a single render call.

### `37z` — Retire getAllIssues singleton: pass issues by argument

Six call sites import `getAllIssues()` directly; tests work around it with `vi.doMock` and a `process.cwd` swap. The moment a second collection (drafts preview, alternate root, multi-language) is wanted, every consumer changes.

- Routes call free functions that accept `issues: IssueMeta[]` (or a content source).
- A single composition root — e.g., `app/_data.ts` — materializes the default source once.
- This obsoletes `withResetIssuesModule` / `withMockedIssues` / `freshImport` ceremony in `tests/helpers/mock-issues.ts`, which is why `k5p` is blocked on this.

### `r9w` — Truncate long OG titles in JS before satori (blocked by `o1p`)

`lib/og.tsx:134-138` relies on `-webkit-line-clamp` for long titles. Satori supports a curated subset of CSS; `WebkitBoxOrient` is via `as` workaround, and a 4-line title at 64px overflows the 630px frame minus padding/footer, clipping into `FooterStripe`.

- After the og split, truncate the title in JS (`title.length > 90 ? title.slice(0, 87) + "…" : title`) before handing to satori, OR scale font-size down for long titles.
- Add a snapshot test for a long title.

### `nkf` — Add getAdjacent monotonicity guard

`loadIssuesFromDir` tie-breaks `b.issue - a.issue`, and `getAdjacent` (`lib/issues.ts:106-117`) treats `idx-1` as "newer". If a publisher inverts issue numbers across a date boundary (e.g. issue #5 on 2026-01-12, #4 on 2026-01-19), the "Newer →" link points to a lower-numbered issue.

- Post-sort, assert `issues[i].issue > issues[i+1].issue` for all `i`; throw at build if violated.

### `adj` — Memoize siteHost() as const SITE_HOST

`lib/site.ts:24-26` calls `new URL(SITE.url).host` on every invocation, including a hot path in `mdx-components.tsx:9`.

- Replace with `export const SITE_HOST = new URL(SITE.url).host`. Pairs naturally with `7k6` (validate at load).

### `k5p` — Consolidate tests/issues.test.ts on withMockedIssues helper (blocked by `37z`)

Three different mocking strategies live in the same file: `process.cwd` swap with symlink (lines 169–188), real content/issues/ usage (216–253), another real-dir block (255–276).

- After `37z`, replace the bespoke `process.cwd` swap with `withMockedIssues` from `tests/helpers/mock-issues.ts`. Most of the helper file may then be deletable.

### `pi9` — Rename loadIssueBody and move out of lib/issues.ts (blocked by `u4a`)

`loadIssueBody` (`lib/issues.ts:119-127`) returns `React.ComponentType`, dragging React/MDX/webpack into the metadata module. Every consumer of `IssueMeta` transitively imports it.

- Move to `components/issue-body.tsx` (the only caller — line 4) or to `lib/issue-body-loader.ts` with `import "server-only"`.
- May be subsumed by `swk` (precompile MDX) entirely.

---

## P3 — Low / polish (6)

### `zgn` — Rename freshImport → typedImport (or fold reset in)

`tests/helpers/mock-issues.ts:23-25`'s `freshImport` performs no module reset; "freshness" comes from `withResetIssuesModule`'s `vi.resetModules()`. The name lies.

- Rename to `typedImport`, fold `vi.resetModules()` into the helper, or delete and inline `await import<typeof ...>`.

### `q7d` — Narrow IssueBody prop to slug: string

`components/issue-body.tsx` takes `issue: IssueMeta` but only reads `issue.slug`. Tests have to fabricate a full `IssueMeta`.

- Change prop to `slug: string`. Both callers already have `issue.slug` to hand.

### `c5r` — Rename IssueRow ↔ issue-card.tsx

Filename says "card", export name says "row". Pick one.

### `0yp` — Drop async from HomePage

`app/page.tsx:8` is `async` but awaits nothing.

- Remove the `async` keyword.

### `dpe` — Apply dynamic='force-static' consistently or drop

Set on `app/feed.xml/route.ts`, `app/sitemap.ts`, `app/robots.ts`, and both opengraph routes — not on `app/issues/page.tsx`. `output: "export"` already pins the contract globally.

- Drop the directive everywhere (preferred), OR apply consistently.

### `4zo` — Demote unused exports

`IssueSource`, `IssueFrontmatter` (`lib/issues.ts:35-36`), and `OgFont` (`lib/og.tsx:11`) are referenced only inside their own files.

- Drop the `export` keyword unless a public-API rationale exists.

### `rex` — content-smoke.test.ts: replace skipIf with hard assertion

`tests/content-smoke.test.ts:8` uses `describe.skipIf(!fs.existsSync(CONTENT_DIR))`. If `content/issues/` ever vanishes, the smoke test silently does not run and CI passes.

- Replace `skipIf` with `it("content directory must exist", () => expect(fs.existsSync(CONTENT_DIR)).toBe(true))`.

### `dr9` — RSS feed: add <content:encoded> with CDATA HTML body (blocked by `swk`)

`lib/feed.ts:41` puts `issue.summary` in `<description>`. Most readers expect HTML in `<description>` or use `<content:encoded>` for the body.

- After `swk`, add `xmlns:content` on `<rss>` and embed rendered HTML in `<content:encoded><![CDATA[...]]></content:encoded>`. Keep summary in `<description>`.

### `swk` — Precompile MDX bodies to HTML strings at build time

`lib/issues.ts:119-127` dynamically imports MDX per slug. Webpack creates one async chunk per issue, each carrying the MDX runtime + Shiki output. The slug-templated dynamic import also pulls every `.mdx` file under `content/issues/` into the build graph regardless of whether it's published. At ~50 issues, build time and `.next/` size grow noticeably.

- Compile MDX bodies to plain HTML at build time using `@mdx-js/mdx` directly with the same rehype/remark pipeline.
- Store on `IssueMeta.body`. Collapses N async chunks → N strings, lets the feed include real HTML descriptions, makes `IssueBody` a sync server component, unblocks `dr9`.

---

## Working an issue

```bash
bd show <id>                              # canonical record
bd update <id> --claim                    # mark in_progress
# ... do the work, run tests, commit ...
bd close <id>                             # mark complete
git pull --rebase && bd dolt push && git push
```

For P0 + P1 batches, prefer one PR per cluster (correctness; issues-split; og-split; etc.) over per-issue PRs — easier review and the changes touch the same surface.
