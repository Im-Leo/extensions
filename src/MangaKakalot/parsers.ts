/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  ContentRating,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  type SearchResultItem,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

import { ContentRatingCache, rateContent } from "../utils/content-rating";
import { DOMAIN, LANGUAGE, type ApiChapter, type ChapterListResponse } from "./models";

/**
 * Listing markup carries no genres, so tiles default until a detail page teaches
 * this. Persisted: resolving a listing costs one request per tile, and without
 * it every app launch pays that again.
 */
const ratings = new ContentRatingCache("content_ratings");

/** Every listing page — discover and genre browse alike — uses this wrapper. */
const LISTING_ITEM = "div.list-comic-item-wrap";

/** Title search renders a different template to the listing pages. */
const SEARCH_ITEM = "div.story_item";

/** Detail pages scope everything under this container. */
const DETAIL_ROOT = "div.main-wrapper";

/** Lazy-loading attributes in the order the site fills them; `srcset` needs splitting. */
const IMAGE_ATTRIBUTES = ["data-src", "data-lazy-src", "srcset", "src", "data-cfsrc"];

export function parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {
  const title = $("img", DETAIL_ROOT).attr("alt")?.trim() ?? "";
  const thumbnailUrl = resolveImageUrl($("img", DETAIL_ROOT));

  const secondaryTitles = $(".story-alternative", DETAIL_ROOT)
    .first()
    .text()
    .trim()
    .replace(/^Alternative\s*:\s*/i, "")
    .split(";")
    .map((alt) => alt.trim())
    .filter((alt) => alt.length > 0);

  // The cell nests a <p> label whose text must not leak into the value.
  const author = $('.info-wrap > div:contains("Author(s):")')
    .first()
    .clone()
    .children("p")
    .remove()
    .end()
    .text()
    .trim();

  const synopsis = Application.decodeHTMLEntities(
    $("#contentBox", DETAIL_ROOT)
      .first()
      .text()
      .replace(/You are reading.*bookmark\./i, "")
      .replace(/<[^>]*>?/gm, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );

  // Rendered as "rate : 4.3" on a 0-10 scale; Paperback expects 0-5.
  const ratingText = $("#rate_row_cmd").text().trim();
  const rating = ((Number(ratingText.match(/rate\s*:\s*([\d.]+)/)?.[1]) || 0) / 10) * 2;

  const status = $("li:contains(Status)", DETAIL_ROOT)
    .text()
    .trim()
    .toUpperCase()
    .includes("COMPLETED")
    ? "Completed"
    : "Ongoing";

  const genres: Tag[] = [];

  for (const node of $("a", $("li.genres", DETAIL_ROOT)).toArray()) {
    const genreTitle = $(node).text().trim();
    const id = cleanId($(node).attr("href") ?? "");
    if (!genreTitle || !id) continue;

    genres.push({ title: genreTitle, id });
  }

  // Detail pages are the only place this site exposes genres, so the result is
  // remembered for later listing tiles of the same title.
  const contentRating = rateContent(genres.map((genre) => genre.title));
  ratings.remember(mangaId, contentRating);

  return {
    mangaId,
    mangaInfo: {
      primaryTitle: title,
      secondaryTitles,
      thumbnailUrl,
      author,
      synopsis,
      rating,
      status,
      contentRating,
      tagGroups: [{ title: "genres", id: "genres", tags: genres }],
      shareUrl: `${DOMAIN}/manga/${mangaId}`,
    },
  };
}

export function parseChapterList(
  response: ChapterListResponse | undefined,
  sourceManga: SourceManga,
): Chapter[] {
  const apiChapters = response?.data?.chapters;
  if (!response?.success || !Array.isArray(apiChapters)) return [];

  return apiChapters.map((chapter: ApiChapter, index) => ({
    sourceManga,
    chapterId: chapter.chapter_slug,
    title: chapter.chapter_name,
    langCode: LANGUAGE,
    chapNum: Number(chapter.chapter_num) || 0,
    publishDate: new Date(chapter.updated_at),
    // The API returns newest first; invert so Paperback orders oldest to newest.
    sortingIndex: apiChapters.length - index,
  }));
}

export function parseChapterDetails($: CheerioAPI, chapter: Chapter): ChapterDetails {
  const pages = $("img", "div.container-chapter-reader")
    .toArray()
    .map((node) => resolveImageUrl($(node)))
    .filter((url) => url.length > 0);

  return {
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    pages,
  };
}

export function parseDiscoverSectionItems(
  $: CheerioAPI,
  section: DiscoverSection,
): DiscoverSectionItem[] {
  const items: DiscoverSectionItem[] = [];

  for (const entry of listingEntries($)) {
    switch (section.type) {
      case DiscoverSectionType.featured:
        items.push({ ...entry, supertitle: entry.subtitle, type: "featuredCarouselItem" });
        break;
      case DiscoverSectionType.chapterUpdates:
        items.push({ ...entry, chapterId: "", type: "chapterUpdatesCarouselItem" });
        break;
      case DiscoverSectionType.prominentCarousel:
        items.push({ ...entry, type: "prominentCarouselItem" });
        break;
      case DiscoverSectionType.simpleCarousel:
        items.push({ ...entry, type: "simpleCarouselItem" });
        break;
    }
  }

  return items;
}

export function parseSearchResults(
  $: CheerioAPI,
  isTitleSearch: boolean,
  browsedGenre?: string,
): SearchResultItem[] {
  if (!isTitleSearch) return listingEntries($, browsedGenre);

  const results: SearchResultItem[] = [];

  for (const node of $(SEARCH_ITEM).toArray()) {
    const mangaId = cleanId($("a", node).attr("href") ?? "");
    const title = $(".story_name", node).text().trim();
    if (!mangaId || !title) continue;

    results.push({
      mangaId,
      title: Application.decodeHTMLEntities(title),
      subtitle: Application.decodeHTMLEntities($(".story_chapter", node).first().text().trim()),
      imageUrl: resolveImageUrl($("img", node)),
      contentRating: ratings.recall(mangaId),
    });
  }

  return results;
}

export function parseGenres($: CheerioAPI): TagSection {
  const tags: Tag[] = [];

  for (const cell of $("td", $('h3:contains("GENRES")').parent()).toArray()) {
    const title = $("a", cell).attr("title")?.trim() ?? "";
    const id = cleanId($("a", cell).attr("href") ?? "");
    if (!title || !id) continue;

    tags.push({ title, id });
  }

  return { title: "Genres", id: "genres", tags };
}

/**
 * Pagination renders the current and last page as separate elements; neither
 * present means the results fit on one page.
 */
export function isLastPage($: CheerioAPI): boolean {
  const currentPage = $(".page-select, .page_select").text();
  if (!currentPage) return true;

  const lastPage = (/(\d+)/.exec($(".page-last, .page_last").text()) ?? [""])[0];
  return Number(lastPage) === Number(currentPage);
}

/**
 * The fields discover items and genre-browse results share. Kept apart from
 * `SearchResultItem`, whose loose `metadata: unknown` is incompatible with the
 * `JSONValue` the carousel types demand.
 */
interface ListingEntry {
  mangaId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  contentRating: ContentRating;
}

function listingEntries($: CheerioAPI, browsedGenre?: string): ListingEntry[] {
  const entries: ListingEntry[] = [];

  // Every title on /genre/<x> carries that genre, so it rates the whole page. Only
  // a rating it raises applies: a safe genre leaves the other genres unknown.
  const fromGenre = browsedGenre ? rateContent([browsedGenre]) : ContentRating.EVERYONE;

  for (const node of $(LISTING_ITEM).toArray()) {
    const mangaId = cleanId($("a", node).attr("href") ?? "");
    const title = $("img", node).attr("alt")?.trim() ?? "";
    if (!mangaId || !title) continue;

    entries.push({
      mangaId,
      title: Application.decodeHTMLEntities(title),
      subtitle: Application.decodeHTMLEntities(
        $("a.list-story-item-wrap-chapter", node).first().text().trim(),
      ),
      imageUrl: resolveImageUrl($("img", node)),
      contentRating: fromGenre === ContentRating.EVERYONE ? ratings.recall(mangaId) : fromGenre,
    });
  }

  return entries;
}

/**
 * A request-ready absolute URL, or "" when no attribute holds one. The result is
 * already percent-encoded; callers must not encode it again.
 */
function resolveImageUrl(image: Cheerio<Element> | undefined): string {
  let url: string | undefined;

  for (const attribute of IMAGE_ATTRIBUTES) {
    const value = image?.attr(attribute);
    if (value == null || value.trim() === "") continue;

    url = attribute === "srcset" ? (value.split(",")[0]?.trim().split(" ")[0] ?? "") : value;
    break;
  }

  if (!url) return "";
  if (url.startsWith("/")) url = DOMAIN + url;

  url = url
    .trim()
    .replace(/\s{2,}/gi, "")
    .replace(/http:\/\/\//g, "http://")
    .replace(/http:\/\//g, "https://")
    .replace(/https:\/\/\//g, "https://");

  return encodeURI(safeDecodeURI(Application.decodeHTMLEntities(url)));
}

/** `decodeURI` throws on a literal `%` that is not a valid escape. */
function safeDecodeURI(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

/** Ids are the final path segment: `/manga/<id>` or `/genre/<id>`. */
function cleanId(href: string): string {
  return href.replace(/\/$/, "").split("/").pop() ?? "";
}

/**
 * Re-stamps parsed tiles with what the cache now knows. Listing parsers run
 * before the detail fetches, so their tiles carry the default until this runs.
 *
 * Discover items are a union whose genres member has no `mangaId`; those pass
 * through untouched rather than being filtered out by the caller.
 */
export function applyLearnedRatings<T extends { contentRating?: ContentRating }>(items: T[]): T[] {
  return items.map((item) =>
    hasMangaId(item) ? { ...item, contentRating: ratings.recall(item.mangaId) } : item,
  );
}

/** The ids worth resolving: every entry that addresses a manga. */
export function ratableIds(items: readonly unknown[]): string[] {
  return items.filter(hasMangaId).map((item) => item.mangaId);
}

function hasMangaId(item: unknown): item is { mangaId: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "mangaId" in item &&
    typeof (item as { mangaId: unknown }).mangaId === "string"
  );
}

/** The cache behind {@link applyLearnedRatings}; passed to `learnMissingRatings`. */
export const ratingCache = ratings;
