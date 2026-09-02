/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { ContentRating, type SourceManga, type TestLogger } from "@paperback/types";
import { expect } from "chai";

import { AsuraScans } from "../AsuraScans/main.js";
import { AS_API_DOMAIN } from "../AsuraScans/models.js";
import {
  latestChapterSubtitle,
  parseChapters,
  parseMangaDetails,
  toSearchResultItem,
} from "../AsuraScans/parsers.js";
import sourceInfo from "../AsuraScans/pbconfig.js";
import {
  chapterListUrl,
  chapterUrl,
  creatorsUrl,
  genresUrl,
  listingUrl,
  searchUrl,
  seriesUrl,
  trendingUrl,
} from "../AsuraScans/urls.js";
import {
  assertChapter,
  assertSearchResultItem,
  assertSourceManga,
  assertUniqueInterceptorIds,
} from "./contracts.js";
import { FUTURE_DATE, PAST_DATE, makeChapter, makeManga } from "./fixtures/asurascans.js";
import { liveTestsEnabled } from "./live-tests.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

const SOURCE_MANGA = {
  mangaId: "example-series",
  mangaInfo: { primaryTitle: "Example Series" },
} as SourceManga;

function registerOfflineTests(suite: TestSuite): void {
  suite.test("interceptor ids are unique", async () => {
    assertUniqueInterceptorIds(AsuraScans, "AsuraScans");
  });

  suite.test("latestChapterSubtitle: survives an empty chapter list", async () => {
    expect(latestChapterSubtitle(makeManga({ latest_chapters: [] }))).to.equal(undefined);
  });

  suite.test("latestChapterSubtitle: flags only future unlock dates", async () => {
    expect(latestChapterSubtitle(makeManga()), "no unlock date").to.equal("Chapter 12");

    expect(
      latestChapterSubtitle(
        makeManga({ latest_chapters: [makeChapter({ early_access_until: PAST_DATE })] }),
      ),
      "a past date is already readable",
    ).to.equal("Chapter 12");

    expect(
      latestChapterSubtitle(
        makeManga({ latest_chapters: [makeChapter({ early_access_until: FUTURE_DATE })] }),
      ),
      "a future date is early access",
    ).to.equal("Chapter 12 - (Early Access)");
  });

  suite.test("toSearchResultItem: prefers cover_url over cover", async () => {
    const withPreferred = toSearchResultItem(makeManga());
    assertSearchResultItem(withPreferred, "search result");
    expect(withPreferred.imageUrl).to.equal("https://cdn.asurascans.com/covers/preferred.webp");

    const fallback = toSearchResultItem(makeManga({ cover_url: undefined }));
    expect(fallback.imageUrl).to.equal("https://cdn.asurascans.com/covers/fallback.webp");
  });

  suite.test("parseMangaDetails: maps the payload", async () => {
    const manga = parseMangaDetails(makeManga());
    assertSourceManga(manga, "detail");

    const info = manga.mangaInfo;
    expect(info.primaryTitle).to.equal("Example Series");
    expect(info.secondaryTitles).to.deep.equal(["Alt One"]);
    expect(info.synopsis).to.equal("First line.\nSecond line.\n");
    expect(info.tagGroups?.[0]?.tags).to.deep.equal([{ id: "action", title: "Action" }]);
    expect(info.additionalInfo?.["id"]).to.equal("42");
    expect(info.shareUrl).to.equal("https://asurascans.com/comics/example-series");
  });

  suite.test('parseMangaDetails: treats "_" as an unknown creator', async () => {
    const manga = parseMangaDetails(makeManga({ author: "_", artist: "_" }));

    expect(manga.mangaInfo.author, "placeholder must not be displayed").to.equal(undefined);
    expect(manga.mangaInfo.artist).to.equal(undefined);
  });

  suite.test("content rating: derived from the title's own genres, not the source", async () => {
    // A source-level rating would assert EVERYONE for adult titles, and an
    // assertion is not something a user's content setting can override.
    const safe = parseMangaDetails(makeManga());
    expect(safe.mangaInfo.contentRating, "action is not mature").to.equal(ContentRating.EVERYONE);

    const adult = parseMangaDetails(
      makeManga({ genres: [{ id: 2, slug: "adult", name: "Adult" }] }),
    );
    expect(adult.mangaInfo.contentRating).to.equal(ContentRating.ADULT);

    const mature = parseMangaDetails(
      makeManga({ genres: [{ id: 3, slug: "ecchi", name: "Ecchi" }] }),
    );
    expect(mature.mangaInfo.contentRating).to.equal(ContentRating.MATURE);
  });

  suite.test("content rating: listing tiles rate as accurately as details", async () => {
    const adult = makeManga({ genres: [{ id: 4, slug: "smut", name: "Smut" }] });

    expect(toSearchResultItem(adult).contentRating).to.equal(ContentRating.ADULT);
    expect(toSearchResultItem(adult).contentRating, "tile and detail must agree").to.equal(
      parseMangaDetails(adult).mangaInfo.contentRating,
    );
  });

  suite.test("content rating: a payload without genres is not treated as safe", async () => {
    const missing = makeManga({ genres: undefined as unknown as [] });
    expect(missing.genres, "fixture really omits genres").to.equal(undefined);
    expect(toSearchResultItem(missing).contentRating).to.equal(ContentRating.EVERYONE);
  });

  suite.test("urls: endpoint paths", async () => {
    expect(trendingUrl()).to.contain("/api/trending/daily");
    expect(trendingUrl(), "carousel size is capped").to.contain("limit=10");
    expect(genresUrl()).to.equal(`${AS_API_DOMAIN}/api/genres`);
    expect(creatorsUrl()).to.equal(`${AS_API_DOMAIN}/api/creators`);
    expect(seriesUrl("example-series")).to.equal(`${AS_API_DOMAIN}/api/series/example-series`);
    expect(chapterListUrl("example-series")).to.equal(
      `${AS_API_DOMAIN}/api/series/example-series/chapters`,
    );
    expect(chapterUrl("example-series", 12)).to.equal(
      `${AS_API_DOMAIN}/api/series/example-series/chapters/12`,
    );
  });

  suite.test("urls: listing paginates by offset, newest first", async () => {
    const url = listingUrl("latest", 40, 20);

    expect(url).to.contain("sort=latest");
    expect(url).to.contain("order=desc");
    expect(url).to.contain("offset=40");
    expect(url).to.contain("limit=20");
  });

  suite.test("urls: search defaults and sort ordering", async () => {
    const plain = searchUrl({ title: "" }, undefined, 0, 20);

    expect(plain, "default sort").to.contain("sort=latest");
    expect(plain, "default order is ascending").to.contain("order=asc");
    expect(plain, "no search key when the title is empty").to.not.contain("search=");

    const descending = searchUrl(
      { title: "", metadata: { orderIsDescending: true } },
      { id: "rating", label: "Rating" },
      0,
      20,
    );
    expect(descending).to.contain("sort=rating");
    expect(descending).to.contain("order=desc");
  });

  suite.test("urls: search collapses apostrophes to a wildcard", async () => {
    const url = searchUrl({ title: "Devil's Line" }, undefined, 0, 20);

    expect(url, "the fragment after the apostrophe is dropped").to.not.contain("s%20Line");
    expect(url, "a wildcard takes its place").to.contain("%25");
  });

  suite.test("urls: search filters are omitted when set to all", async () => {
    const all = searchUrl(
      { title: "", metadata: { seriesStatus: ["all"], seriesType: ["all"] } },
      undefined,
      0,
      20,
    );
    expect(all, "status=all is not a filter").to.not.contain("status=");
    expect(all, "type=all is not a filter").to.not.contain("type=");

    const filtered = searchUrl(
      {
        title: "",
        metadata: {
          genres: ["action", "drama"],
          seriesStatus: ["ongoing"],
          seriesType: ["manhwa"],
        },
      },
      undefined,
      0,
      20,
    );
    expect(filtered, "genres are comma joined").to.contain("genres=action,drama");
    expect(filtered).to.contain("status=ongoing");
    expect(filtered).to.contain("type=manhwa");
  });

  suite.test("urls: mangatoon is served under the manga type", async () => {
    const url = searchUrl({ title: "", metadata: { seriesType: ["mangatoon"] } }, undefined, 0, 20);

    expect(url).to.contain("type=manga");
    expect(url).to.not.contain("mangatoon");
  });

  suite.test("parseChapters: hides premium chapters unless enabled", async () => {
    const response = {
      data: [
        makeChapter({ id: 1, number: 1 }),
        makeChapter({ id: 2, number: 2, is_premium: true }),
      ],
    };

    const hidden = parseChapters(response, SOURCE_MANGA, false);
    expect(hidden, "premium chapters are hidden by default").to.have.lengthOf(1);
    expect(hidden[0]?.chapNum).to.equal(1);

    const shown = parseChapters(response, SOURCE_MANGA, true);
    expect(shown, "enabling upcoming chapters reveals them").to.have.lengthOf(2);
    expect(shown[1]?.additionalInfo?.["early_access"]).to.equal("true");
  });

  suite.test("parseChapters: produces valid chapters", async () => {
    const chapters = parseChapters({ data: [makeChapter()] }, SOURCE_MANGA, false);

    expect(chapters).to.have.lengthOf(1);
    chapters.forEach((chapter, index) => assertChapter(chapter, `chapter ${index}`));
    expect(chapters[0]?.sortingIndex).to.equal(12);
  });
}

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("AsuraScans tests", logger);

  registerOfflineTests(suite);

  if (liveTestsEnabled()) {
    registerDefaultTests(suite, AsuraScans, sourceInfo);
  } else {
    suite.skip("live end-to-end", "set PB_LIVE=1 to run network tests");
  }

  await suite.run();
}
