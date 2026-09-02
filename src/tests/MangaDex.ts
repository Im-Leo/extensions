/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { ContentRating, type TestLogger } from "@paperback/types";
import { expect } from "chai";

import {
  assignChapterNumber,
  buildChapterIdentifier,
  normalizePagesCount,
} from "../MangaDex/chapter-parsers.js";
import { isRatingAllowed } from "../MangaDex/chapter-utils.js";
import { swapItems } from "../MangaDex/forms/reorderable.js";
import { MangaDex } from "../MangaDex/main.js";
import { OriginalLanguage, RelationshipType, type Relationship } from "../MangaDex/models.js";
import {} from "../MangaDex/parsers.js";
import sourceInfo from "../MangaDex/pbconfig.js";
import {
  buildCoverImageUrl,
  collectUniqueMangaIdsFromChapters,
  extractCoverImageUrl,
  filterMangaRelationships,
  findMangaRelationship,
  findMangaRelationshipId,
} from "../MangaDex/relationships.js";
import { dispatchSearch } from "../MangaDex/search-dispatch.js";
import {
  expandOriginalLanguages,
  parseYearInput,
  resolveSortOrder,
} from "../MangaDex/search/filters.js";
import { buildAtHomeServerUrl, buildMangaListUrl } from "../MangaDex/urls.js";
import {
  chunk,
  computeNextMetadata,
  formatCreatedAtSince,
  formatPublishAtSince,
  isNotFoundError,
  parseDateOrEpoch,
  parseDateOrUndefined,
  reorderById,
  shouldSkipByCount,
} from "../MangaDex/utils.js";
import { assertUniqueInterceptorIds } from "./contracts.js";
import { liveTestsEnabled } from "./live-tests.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

function relationship(type: RelationshipType, fileName?: string): Relationship {
  const base = { id: `r-${type}`, type };
  if (fileName === undefined) return base;

  return {
    ...base,
    attributes: {
      description: "",
      volume: null,
      fileName,
      locale: OriginalLanguage.En,
      createdAt: "",
      updatedAt: "",
      version: 1,
    },
  };
}

/**
 * Characterization tests over MangaDex's pure helpers.
 *
 * They pin current behaviour rather than desired behaviour: a failure during a
 * restructuring means the move changed something, not that the test is stale.
 */
const UUID = "f9c33607-9180-4ba6-b85c-e4b5faee7192";

function registerHelperTests(suite: TestSuite): void {
  suite.test("chunk: splits into batches, last one short", async () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).to.deep.equal([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10), "empty input yields no batches").to.deep.equal([]);
  });

  suite.test("isNotFoundError: recognises all three 404 shapes", async () => {
    expect(isNotFoundError(new Error("boom [404] nope"))).to.equal(true);
    expect(isNotFoundError(new Error("HTTP 404"))).to.equal(true);
    expect(isNotFoundError("404 MangaDex Request Failed")).to.equal(true);
    expect(isNotFoundError(new Error("HTTP 500")), "other errors are not 404").to.equal(false);
  });

  suite.test("reorderById: restores requested order and drops absent ids", async () => {
    const items = [{ id: "b" }, { id: "a" }, { id: "c" }];

    expect(reorderById(items, ["a", "b", "c"])).to.deep.equal([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    expect(reorderById(items, ["a", "missing"]), "unknown ids vanish").to.deep.equal([{ id: "a" }]);
  });

  suite.test("computeNextMetadata: stops on short page, total, and offset cap", async () => {
    expect(computeNextMetadata(0, 100, 500, 100), "full page mid-set").to.deep.equal({
      offset: 100,
    });
    expect(computeNextMetadata(0, 42, 500, 100), "partial page ends paging").to.equal(undefined);
    expect(computeNextMetadata(400, 100, 500, 100), "total reached").to.equal(undefined);
    // MangaDex rejects offsets at or beyond 10000.
    expect(computeNextMetadata(9900, 100, 99999, 100), "offset cap").to.equal(undefined);
  });

  suite.test("formatCreatedAtSince: anchors to the start of the UTC day", async () => {
    const formatted = formatCreatedAtSince(Date.UTC(2026, 0, 15, 13, 45, 30));

    expect(formatted).to.equal("2026-01-15T00:00:00");
    expect(formatted, "no milliseconds or zone suffix").to.not.match(/\.\d{3}|Z$/);
  });

  suite.test("formatPublishAtSince: drops ms and zone, undefined when invalid", async () => {
    expect(formatPublishAtSince(new Date("2026-01-15T13:45:30.123Z"))).to.equal(
      "2026-01-15T13:45:30",
    );
    expect(formatPublishAtSince(undefined)).to.equal(undefined);
    expect(formatPublishAtSince(new Date("nonsense")), "invalid Date").to.equal(undefined);
  });

  suite.test("date parsing: epoch fallback versus undefined", async () => {
    expect(parseDateOrEpoch("2026-01-15T00:00:00Z").getTime()).to.equal(
      Date.UTC(2026, 0, 15, 0, 0, 0),
    );
    expect(parseDateOrEpoch(undefined).getTime(), "missing becomes epoch").to.equal(0);
    expect(parseDateOrEpoch("nonsense").getTime(), "unparseable becomes epoch").to.equal(0);

    expect(parseDateOrUndefined("")).to.equal(undefined);
    expect(parseDateOrUndefined(null)).to.equal(undefined);
    expect(parseDateOrUndefined("nonsense")).to.equal(undefined);
    expect(parseDateOrUndefined("2026-01-15T00:00:00Z")?.getTime()).to.equal(
      Date.UTC(2026, 0, 15, 0, 0, 0),
    );
  });

  suite.test("shouldSkipByCount: threshold 1 is any, above 1 is a percentage", async () => {
    expect(shouldSkipByCount(1, 1, 100), "threshold 1 means any at all").to.equal(true);
    expect(shouldSkipByCount(1, 0, 100)).to.equal(false);
    expect(shouldSkipByCount(50, 50, 100), "50% meets a 50 threshold").to.equal(true);
    expect(shouldSkipByCount(50, 49, 100), "49% does not").to.equal(false);
    expect(shouldSkipByCount(0, 10, 100), "disabled threshold never skips").to.equal(false);
    expect(shouldSkipByCount(50, 10, undefined), "no total, no decision").to.equal(false);
  });

  suite.test("cover URLs: built from the cover_art relationship, empty when absent", async () => {
    const url = buildCoverImageUrl("manga-1", "cover.jpg", "original");
    expect(url).to.contain("manga-1");
    expect(url).to.contain("cover.jpg");

    const relationships = [
      relationship(RelationshipType.Author),
      relationship(RelationshipType.CoverArt, "cover.jpg"),
    ];
    expect(extractCoverImageUrl(relationships, "manga-1", "original")).to.equal(url);

    expect(
      extractCoverImageUrl([relationship(RelationshipType.Author)], "manga-1", "original"),
    ).to.equal("");
    expect(extractCoverImageUrl(undefined, "manga-1", "original")).to.equal("");
  });

  suite.test("relationship helpers: first manga, lowercased id, and all manga", async () => {
    const relationships = [
      { id: "", type: "manga" },
      { id: "AbC", type: "manga" },
      { id: "x", type: "author" },
      { id: "def", type: "manga" },
    ];

    expect(findMangaRelationship(relationships)?.id).to.equal("AbC");
    expect(findMangaRelationshipId(relationships), "ids are lowercased").to.equal("abc");
    expect(filterMangaRelationships(relationships).length, "every manga, in order").to.equal(3);

    expect(findMangaRelationship(undefined)).to.equal(undefined);
    expect(filterMangaRelationships(undefined)).to.deep.equal([]);
  });

  suite.test("swapItems: swaps in range, rejects anything outside it", async () => {
    const items = ["a", "b", "c"];

    expect(swapItems(items, 0, 2), "swaps the two positions").to.deep.equal(["c", "b", "a"]);
    expect(items, "the input is not mutated").to.deep.equal(["a", "b", "c"]);

    expect(swapItems(items, 0, 3), "`to` past the end").to.equal(null);
    expect(swapItems(items, 3, 0), "`from` past the end").to.equal(null);
    // Negative indices must be rejected, not read from the end as `at()` would.
    expect(swapItems(items, -1, 0), "negative `from`").to.equal(null);
    expect(swapItems(items, 0, -1), "negative `to`").to.equal(null);
  });

  suite.test("dispatchSearch: a pasted URL opens the entry directly", async () => {
    // The query box doubles as an address bar, so a link is a lookup, not a search.
    expect(dispatchSearch("https://mangadex.org/title/" + UUID)).to.deep.equal({
      prefix: "id",
      uuid: UUID,
    });
    expect(dispatchSearch("https://mangadex.org/chapter/" + UUID)?.prefix).to.equal("ch");

    // Ids are lowercased because the API returns one case and callers key by it.
    expect(dispatchSearch("https://mangadex.org/title/" + UUID.toUpperCase())?.uuid).to.equal(UUID);
  });

  suite.test("dispatchSearch: prefix form, including the pre-v5 numeric ids", async () => {
    expect(dispatchSearch(`id: ${UUID}`)).to.deep.equal({ prefix: "id", uuid: UUID });
    expect(dispatchSearch(`grp:${UUID}`)?.prefix).to.equal("grp");

    // Numeric ids still circulate in old links and resolve through /legacy/mapping.
    expect(dispatchSearch("https://mangadex.org/title/12345")).to.deep.equal({
      prefix: "id",
      uuid: "12345",
    });
    expect(dispatchSearch("ch: 999")).to.deep.equal({ prefix: "ch", uuid: "999" });
  });

  suite.test("dispatchSearch: ordinary text stays an ordinary search", async () => {
    expect(dispatchSearch("Berserk"), "a plain title").to.equal(undefined);
    expect(dispatchSearch(""), "empty").to.equal(undefined);
    expect(dispatchSearch("   "), "whitespace only").to.equal(undefined);
    expect(dispatchSearch(undefined)).to.equal(undefined);
    // A prefix without a valid id is not a lookup either.
    expect(dispatchSearch("id: not-a-uuid")).to.equal(undefined);
  });

  suite.test("urls: manga list carries the filters that only a request would reveal", async () => {
    const url = buildMangaListUrl({
      limit: 100,
      ratings: ["safe", "suggestive"],
      languages: ["en"],
      offset: 200,
      hasAvailableChapters: true,
    }).toString();

    expect(url).to.contain("/manga");
    expect(url, "ratings repeat as an array key").to.contain("contentRating%5B%5D=safe");
    expect(url).to.contain("availableTranslatedLanguage%5B%5D=en");
    expect(url).to.contain("offset=200");
    expect(url).to.contain("hasAvailableChapters=true");
    // The cover relationship is requested by default or every tile loses its art.
    expect(url, "cover_art is included by default").to.contain("cover_art");
  });

  suite.test("urls: empty filter arrays are omitted, not sent empty", async () => {
    // An empty `ids[]` matches nothing rather than everything, so it must not ship.
    const url = buildMangaListUrl({ limit: 10, ratings: ["safe"], ids: [], statuses: [] });
    expect(url.toString()).to.not.contain("ids%5B%5D");
    expect(url.toString()).to.not.contain("status%5B%5D");
  });

  suite.test("urls: at-home server honours the forced-443 setting", async () => {
    expect(buildAtHomeServerUrl(UUID)).to.contain(UUID);
    expect(buildAtHomeServerUrl(UUID, true), "networks that block other ports").to.contain(
      "forcePort443=true",
    );
    expect(buildAtHomeServerUrl(UUID, false)).to.not.contain("forcePort443");
  });

  suite.test("assignChapterNumber: an unnumbered chapter sorts just below the last", async () => {
    expect(assignChapterNumber("12", 11)).to.deep.equal({ chapNum: 12, isUnnumbered: false });

    // MangaDex allows a null chapter number; Paperback requires one, so an
    // unnumbered entry is placed fractionally below its predecessor to keep the
    // feed's order rather than jumping to the top.
    expect(assignChapterNumber(null, 11)).to.deep.equal({ chapNum: 10.999, isUnnumbered: true });
    expect(assignChapterNumber("", 11).isUnnumbered, "empty string is unnumbered").to.equal(true);
    expect(assignChapterNumber("oneshot", 11).isUnnumbered, "unparseable").to.equal(true);

    // Nothing precedes it, so there is no gap to sit in.
    expect(assignChapterNumber(null, 0)).to.deep.equal({ chapNum: 0, isUnnumbered: true });
  });

  suite.test("buildChapterIdentifier: separates duplicate uploads of one chapter", async () => {
    // The same chapter is often uploaded by several groups in several languages;
    // the id has to keep them apart or the reader shows one and hides the rest.
    expect(buildChapterIdentifier(12, false, "", "en", 0, 2, false)).to.equal("12-en");
    expect(buildChapterIdentifier(12, false, "", "es", 0, 2, false)).to.equal("12-es");

    // Some series restart numbering each volume, so the volume must be in the key.
    expect(buildChapterIdentifier(12, false, "", "en", 0, 2, true)).to.equal("2-12-en");

    // Unnumbered chapters key on their title, falling back to position.
    expect(buildChapterIdentifier(0, true, "Omake", "en", 3, 1, false)).to.equal("unn-omake-en");
    expect(buildChapterIdentifier(0, true, "  ", "en", 3, 1, false)).to.equal("unn-idx3-en");
  });

  suite.test("normalizePagesCount: only a positive finite count is a count", async () => {
    expect(normalizePagesCount(20)).to.equal(20);
    expect(normalizePagesCount("20"), "the API sends it as a string").to.equal(20);
    expect(normalizePagesCount(0)).to.equal(0);
    expect(normalizePagesCount(-1), "negative is not a page count").to.equal(0);
    expect(normalizePagesCount(undefined)).to.equal(0);
    expect(normalizePagesCount("many")).to.equal(0);
  });

  suite.test("isRatingAllowed: a stored rating wins, else the lossy reverse map", async () => {
    // MangaDex's own rating is authoritative when the manga carries one.
    expect(isRatingAllowed("erotica", ContentRating.MATURE, ["safe", "suggestive"])).to.equal(
      false,
    );
    expect(isRatingAllowed("erotica", ContentRating.MATURE, ["erotica"])).to.equal(true);

    // Without one, the Paperback bucket maps back to several MangaDex ratings and
    // any of them being enabled admits the chapter.
    expect(isRatingAllowed(undefined, ContentRating.EVERYONE, ["safe"])).to.equal(true);
    expect(isRatingAllowed(undefined, ContentRating.EVERYONE, ["erotica"])).to.equal(false);
  });

  suite.test("expandOriginalLanguages: one selection can mean several API codes", async () => {
    expect(expandOriginalLanguages([]), "nothing selected").to.deep.equal([]);

    // Chinese covers both zh and zh-hk; the API will not infer the second.
    const chinese = expandOriginalLanguages(["zh"]);
    expect(chinese, "the selection itself is kept").to.contain("zh");
    expect(chinese.length, "and its extra codes are added").to.be.greaterThan(1);
  });

  suite.test("parseYearInput: only a four-digit year is a year", async () => {
    expect(parseYearInput("2019")).to.equal(2019);
    expect(parseYearInput(" 2019 "), "trimmed").to.equal(2019);
    expect(parseYearInput("19"), "too short").to.equal(undefined);
    expect(parseYearInput("20199"), "too long").to.equal(undefined);
    expect(parseYearInput("since 2019"), "not a bare year").to.equal(undefined);
    expect(parseYearInput(undefined)).to.equal(undefined);
  });

  suite.test("resolveSortOrder: relevance applies only to a title search", async () => {
    expect(resolveSortOrder(undefined, true), "a title search defaults to relevance").to.deep.equal(
      { orderKey: "order[relevance]", orderValue: "desc" },
    );
    // Browsing has no query to be relevant to, so the API's own order stands.
    expect(resolveSortOrder(undefined, false)).to.deep.equal({});

    const followed = { id: "order[followedCount]-desc", label: "Popular" };
    expect(resolveSortOrder(followed, false)).to.deep.equal({
      orderKey: "order[followedCount]",
      orderValue: "desc",
    });

    // Relevance carried over from a previous search must not survive into a browse.
    const relevance = { id: "order[relevance]-desc", label: "Relevance" };
    expect(resolveSortOrder(relevance, false)).to.deep.equal({});
  });

  suite.test("collectUniqueMangaIdsFromChapters: keeps first chapter per manga", async () => {
    const chapters = [
      { id: "c1", relationships: [{ id: "M1", type: "manga" }] },
      { id: "c2", relationships: [{ id: "m1", type: "manga" }] },
      { id: "c3", relationships: [{ id: "m2", type: "manga" }] },
      { id: "c4", relationships: [] },
    ];

    const { ids, chapterByMangaId } = collectUniqueMangaIdsFromChapters(chapters as never);

    expect(ids).to.deep.equal(["m1", "m2"]);
    expect(chapterByMangaId.get("m1")?.id, "the first chapter wins").to.equal("c1");
  });
}

function registerContractTests(suite: TestSuite): void {
  suite.test("interceptor ids are unique", async () => {
    assertUniqueInterceptorIds(MangaDex, "MangaDex");
  });

  suite.test("declares discover sections with unique ids and types", async () => {
    const sections = await MangaDex.getDiscoverSections();

    expect(sections.length, "at least one discover section").to.be.greaterThan(0);
    for (const section of sections) {
      expect(section.id, "section id must be non-empty").to.be.a("string").and.not.equal("");
      expect(section.title, "section title must be non-empty").to.be.a("string").and.not.equal("");
      expect(section.type, `section ${section.id} has no type`).to.not.equal(undefined);
    }

    const ids = sections.map((section) => section.id);
    expect(new Set(ids).size, "section ids must be unique").to.equal(ids.length);
  });

  suite.test("declares sorting options with unique ids", async () => {
    const options = await MangaDex.getSortingOptions({ title: "" });

    expect(options.length, "at least one sorting option").to.be.greaterThan(0);
    for (const option of options) {
      expect(option.id).to.be.a("string").and.not.equal("");
      expect(option.label).to.be.a("string").and.not.equal("");
    }

    const ids = options.map((option) => option.id);
    expect(new Set(ids).size, "sorting ids must be unique").to.equal(ids.length);
  });
}

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaDex tests", logger);

  registerHelperTests(suite);
  registerContractTests(suite);

  if (liveTestsEnabled()) {
    registerDefaultTests(suite, MangaDex, sourceInfo);
  } else {
    suite.skip("live end-to-end", "set PB_LIVE=1 to run network tests");
  }

  await suite.run();
}
