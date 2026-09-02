# Extensions

Five manga sources for [Paperback](https://paperback.moe) 0.9, built and published as a single
extension repository.

| Extension    | Site            | Shape                                    |
| ------------ | --------------- | ---------------------------------------- |
| AsuraScans   | asurascans.com  | REST API, account sync, tile descrambler |
| FlameComics  | flamecomics.xyz | Next.js data routes                      |
| MangaDex     | mangadex.org    | Official API, settings, collections      |
| MangaFox     | fanfox.net      | HTML scraper, obfuscated page URLs       |
| MangaKakalot | mangakakalot.gg | HTML scraper, Cloudflare protected       |

## Why this exists

The sources I read break often (a title stops showing, covers go blank, a search starts
throwing, performance issues, etc) and the extensions I relied on were not updated often enough to keep up. So I wrote my
own.
Each of the five here is written from scratch rather than forked, using
[Inkdex's extension template](https://github.com/inkdex/template-extensions) as a base.

Every source follows the same layering, parsers are pure functions with offline fixtures,
and behaviour that can only be observed by making a request is pulled out until it can
be asserted without one, so when a site changes, a test says which selectormoved instead
of the app quietly rendering an empty shelf.

## Installing

Add the published repository URL in Paperback under **Settings → Extension Repositories**, then
install the sources you want. To run a local build on a device instead, see
[Development](#development).

### Covers not showing?

**After reinstalling an extension, restart the app.** Reinstalling while Paperback
is running can leave the source's interceptors unregistered for images the
library has already tried to load, and the failure is cached: search and discover
work in the same session while library tiles stay blank. A restart re-registers
them. This bites MangaKakalot in particular, whose cover CDN answers 403 to any
request without a `Referer`, the header that interceptor adds.

Paperback hides artwork whose content rating you have not opted into; the placeholder letter is the
rating's initial (`U` unrated, `M` mature). This is a setting, not a fault. Under **Settings →
Content**, enable the ratings you want visible and turn off blurring for them; covers appear once
their rating is one you have opted into.

## Development

Requires Node 24, matching CI.

```
npm ci                 install the toolchain
npm run bundle         build every extension into bundles/
npm run serve          serve bundles/ over the LAN
npm test               offline test suite (no network)
npm run test:live      offline suite plus live network tests
npm run conformance    tsc + lint + format checks
npm run logcat -- --ip <device-ip>    stream extension logs from a device
```

Working loop: `npm run bundle`, `npm run serve`, add `http://<your-ip>:8080` as a repository in
Paperback, then reinstall the extension after each rebuild.

`paperback-cli serve --watch` hangs the server on rebuild, so bundle explicitly instead.

### How a build reaches the app

```
src/<Name>/*.ts  --tsc (type-check only, noEmit)-->  no output
       |
       +--paperback-cli bundle-->  bundles/  --CI-->  gh-pages  --HTTP-->  Paperback
```

A directory under `src/` is an extension if and only if it contains `pbconfig.ts`, which declares
its name, version, icon, and capabilities. The bundler inlines each extension's entire import graph
into one self-contained file, so extensions share no runtime and cannot affect one another. Shared
source is therefore copied into every bundle that imports it.

`tsc` is a correctness gate rather than a build step; `tsconfig.json` sets `noEmit`.

The publishing branch must match `[0-9]+.[0-9]+/*` or `bundle-deploy.yaml` never fires.

## Layout

Every extension follows the same layering:

| File          | Responsibility                                    |
| ------------- | ------------------------------------------------- |
| `pbconfig.ts` | manifest only                                     |
| `models.ts`   | domain types and site constants                   |
| `network.ts`  | interceptor and request helpers                   |
| `parsers.ts`  | raw HTML/JSON into Paperback domain objects       |
| `reader.ts`   | page-image extraction, where a site obfuscates it |
| `forms/`      | settings and advanced-search forms                |
| `main.ts`     | the `ExtensionImpl`, wiring only                  |

`main.ts` reads as a table of contents; parsing logic does not belong there. `network.ts` appears
only where a source needs its own request helpers; MangaFox and MangaKakalot delegate to
`utils/network` instead, so a local file would be an empty pass-through.

A source may add modules beyond those core names when it has responsibilities the others do not.
AsuraScans keeps `tracking.ts` for progress sync; distinct from `forms/progress.ts`, which is only
that feature's UI and a `urls.ts` holding one named builder per endpoint. Both `urls.ts` files
exist for the same reason: a URL built inline inside an `async` method can only be checked by making
the request, whereas a named builder is a pure function with offline tests behind it.

MangaDex is several times the size of the others and is split further, so that no module answers
more than one question:

| Module                                         | Owns                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `state/`                                       | persisted settings, one file per area, re-exported from `state/index.ts`                                                                 |
| `search/`                                      | `filters.ts` (form selections into query options), `fetchers.ts` (the requests behind a page), `by-prefix.ts` (`usr:` and `list:` feeds) |
| `ratings.ts`, `relationships.ts`               | the rating vocabularies, and navigation of the `relationships` array                                                                     |
| `chapters.ts`, `chapter-feed.ts`, `updates.ts` | reading a feed, the manga inlined on each chapter, and the library-update flow                                                           |

The `state/index.ts` barrel is why that split cost nothing: settings are imported by name rather than
by area, so every `from "./state"` still resolves and no consumer changed.

`src/utils/` holds code shared between extensions:

| Module              | Used by                                         |
| ------------------- | ----------------------------------------------- |
| `content-rating.ts` | AsuraScans, FlameComics, MangaFox, MangaKakalot |
| `interceptor.ts`    | AsuraScans, FlameComics, MangaFox, MangaKakalot |
| `network.ts`        | FlameComics, MangaFox, MangaKakalot             |
| `url-builder/`      | AsuraScans                                      |

Because `paperback-cli` inlines the whole import graph into every bundle, this code is copied into
each extension rather than shared at runtime. One edit therefore reaches four sources at once, which
is why `src/tests/shared-utils.ts` tests these modules directly instead of relying on the per-source
suites to notice.

## Rate limiting

Each source declares a `BasicRateLimiter` in its `main.ts`. All five set `ignoreImages: true`, so
cover and page images bypass the budget entirely (only API and page requests are paced).

| Source       | Requests/sec | Why                                     |
| ------------ | ------------ | --------------------------------------- |
| FlameComics  | 10           | plain JSON endpoints, no protection     |
| AsuraScans   | 6            | tolerant CDN                            |
| MangaDex     | 5            | matches the documented public API limit |
| MangaFox     | 12           | measured against the site; see below    |
| MangaKakalot | 8            | measured against the site; see below    |

**MangaKakalot is the one Cloudflare-protected source, so its budget is the one to suspect first.**
It was inherited at 1/sec. Twelve listing pages requested at once all returned 200 in about a second
with no challenge, so the limit is 8 (still short of what the site absorbed), because a re-triggered
challenge fails the whole source closed rather than merely slowing it.

That measurement has a hole worth knowing: Cloudflare guards this site's _detail_ pages but not its
listing pages, so the evidence behind 8 comes only from endpoints it does not challenge. If the
source starts failing closed on device, this limit is the first thing to walk back.

**MangaFox's limit is what governs how fast a chapter opens.** Paginated chapters need one
`chapterfun.ashx` request per page, and a long chapter is ~46 pages, so the budget is multiplied by
the page count. At the inherited 4/sec, a chapter took ~11 s, of which the limiter accounted for
essentially all: each request costs ~215 ms, but 4/sec spaces them 250 ms apart.

The current limit is 12/sec (the site returned all 45 page requests issued at once in ~520 ms),
every response a 200 that unpacked to a real page URL. Two things had to change together for
that to pay off: `reader.ts` issues page 1 alone (its key is single-use) and the remaining pages
together, since a serial loop cannot spend a larger budget, and a concurrent loop under a 4/sec
budget cannot either.

## Content ratings

Paperback blurs artwork by rating, so a wrong rating is a privacy problem rather than a cosmetic
one. Two rules follow, and `src/utils/content-rating.ts` exists to enforce them in one place:

**A rating is derived from the title in hand. Never asserted for a whole source.** Both failure
modes have shipped here. A blanket `ContentRating.EVERYONE` tells the app adult artwork is safe, and
because it is an assertion rather than an absence, no user setting can override it. The mirror image
is rating from a site's static genre catalog, which always contains "Adult" and so rated every
title ADULT.

**Unknown must never read as safe.** MangaFox and MangaKakalot serve listing grids carrying only
title, cover, and latest chapter (no genres), and classifying a tile costs one detail request each:
70 on a MangaFox listing page, and Cloudflare-challenged on MangaKakalot. Those tiles therefore
report `UNRATED_LISTING_DEFAULT` (MATURE), so the cost of not knowing is a blurred safe cover rather
than exposed adult artwork.

Three mechanisms narrow that gap without extra requests:

| Source                  | Where the rating comes from                                       |
| ----------------------- | ----------------------------------------------------------------- |
| MangaDex                | the API's own `contentRating`                                     |
| AsuraScans, FlameComics | `genres[]` / `categories`+`tags`, present on listings and details |
| MangaFox, MangaKakalot  | detail genres; genre-browse pages; otherwise the default          |

Genres reach the classifier under two names; a detail page gives the display
name ("Sexual Violence"), browsing gives the URL slug ("sexual-violence"), so
separators are folded to spaces before matching. The vocabulary is drawn from
what these sites actually tag with, which on MangaKakalot alone runs to 277
genres.

Browsing `/genre/adult` is itself evidence about every tile on the page, so those rate accurately.
Only a genre that _raises_ the rating counts; a safe genre says nothing about a title's other
genres and must not assert safety. And `ContentRatingCache` remembers what detail pages teach, so a
title reverts from the default to its real rating once opened.

Paperback masks grid tiles by content rating but not the featured hero carousel,
so MangaKakalot declares no `featured` section; "New Titles" is a
`prominentCarousel` instead. A test pins that, since the type is otherwise an
easy thing to change back.

Because that costs a request per tile, MangaKakalot's cache is persisted under
the source's own state and reloaded on launch; otherwise every restart repays
the whole listing. It is bounded, and written once per batch rather than per
title.

**MangaKakalot resolves listing tiles eagerly; MangaFox does not.** MangaKakalot reads the detail
page of every unrated tile before returning a listing, which rates its grids exactly. It is the
source whose front page actually carries explicit covers. Those requests go through a bounded pool
(`RESOLUTION_CONCURRENCY`), because the rate limiter caps requests per second but not how many are
outstanding: issuing a whole page at once returned Cloudflare 520/522 errors from the origin, while
the same requests pooled complete cleanly.

The same treatment was measured on MangaFox and **deliberately dropped in favor of performance**.
Its listing pages carry 70 tiles against MangaKakalot's 24, and its detail pages are ~366 KB each.
Roughly 24 MB per carousel, across three listing sections plus search, on top of 86 s unpooled or a
few seconds pooled. That is not a reasonable cost on a phone, so MangaFox keeps the cheap path: the
conservative default, genre-browse evidence, and ratings learned as titles are opened. The
consequence is that a MangaFox tile can stay at `MATURE` until its title has been opened once.

## Testing

Two suites, answering different questions.

**`npm test` offline, ~120 ms, must be 100% green.** Parser tests against hand-written fixtures in
`src/tests/fixtures/`, plus shared contract assertions in `src/tests/contracts.ts`. Needing no
network, it also covers MangaKakalot, which live tests can never reach because Cloudflare blocks it.

**`npm run test:live` hits the real sites.** Slower and dependent on someone else's data.
MangaDex's live tests pin a specific manga. The suite otherwise takes the first
search result, and many of MangaDex's most popular titles are licensed; every
chapter carries `externalUrl` with `pages: 0`, so `getChapters` correctly returns
none and the assertion fails on the right behavior.

MangaKakalot's four failures are expected rather than a regression: Cloudflare challenges it from
Node, and every later step depends on the search that fails first. Its listing-tile rating
resolution therefore has offline coverage only, and is verifiable on device alone.

Live tests are opt-in through `PB_LIVE=1`, set by `scripts/test-live.mjs`. The harness runs bundles
in a `vm` context that omits `process` but passes the host `globalThis` through, so the flag is read
as `globalThis.process?.env?.PB_LIVE` (`src/tests/live-tests.ts`). It defaults to off, so a broken
probe disables live tests rather than quietly skipping offline ones.

CI mirrors the split: push and pull requests run the offline gate; a daily schedule runs the live
suite as `continue-on-error`, where a failure means a site changed rather than the branch breaking.

`tsconfig.json` runs every strict flag TypeScript offers except one: `exactOptionalPropertyTypes`
is deliberately off: it reports 54 errors, and 19 are the same shape `{ metadata: undefined }`
assigned where the type says `metadata?:`. Paperback treats an absent cursor and an undefined one
identically, so satisfying it would mean a conditional spread at every paged return, which is noise
in exchange for a distinction nothing acts on.

The suite is type-checked along with the sources; `tsconfig.json` excludes nothing. This matters
more than it sounds: JavaScript ignores extra arguments, so a test calling a since-changed helper
keeps passing while asserting nothing. Four sources once had their content-rating behavior rewritten
with every test still green, because the stale calls were invisible to both the runner and `tsc`.

### Writing tests

Fixtures are hand-written and contain only the elements a parser queries, so a failure points at one
selector rather than a whole page. Prefer method-form assertions (`expect(x.length).to.equal(0)`)
over chai's property form (`.to.be.empty`); the latter is a bare property access, so a typo passes
silently.

Tests aim at the failure modes these sources actually exhibit: content ratings derived from a
title's own tags rather than a static catalog, search metadata using the current key, chapter ids
containing dots, numeric page ordering, and interceptor ids being unique within an extension.

MangaDex's helpers also carry characterization tests, which pin current behavior so a refactor can
be proven not to change it. If one fails after a refactor, the refactor is wrong.

## Known gaps

Capabilities these sources lack, rather than faults.

**FlameComics**: no novel support (novels are filtered out, since a manga reader cannot render
them), no settings form, and no deep search across alternative titles.

**MangaKakalot**: detail covers can look soft. The site serves one image per title from `/thumb/`
at whatever resolution was uploaded, measured between 160×213 and 480×623. A small source stretched
to fill the detail hero is unavoidably blurry, and no larger variant is served.

**MangaFox**: listing tiles are rated conservatively rather than exactly. Resolving them properly
costs a detail page each, and at 70 tiles of ~366 KB per listing, that is roughly 24 MB per carousel,
so a tile can read `MATURE` until its title has been opened once. See
[Content ratings](#content-ratings).

## Licensing

GPL-3.0-or-later. The full text is in [`LICENSE`](LICENSE), the licence is declared in
`package.json`, and all 95 source files carry `SPDX-License-Identifier: GPL-3.0-or-later` with
`Copyright © 2026 Im-Leo`.

The repository layout, toolchain configuration, and CI workflows derive from
[Inkdex's extension template](https://github.com/inkdex/template-extensions).
