/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  BasicRateLimiter,
  CookieStorageInterceptor,
  DiscoverSectionType,
  URL,
  type Chapter,
  type ChapterDetails,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type PagedResults,
  type Request,
  type AdvancedSearchForm,
  type SearchQuery,
  type SearchResultItem,
  type SourceManga,
} from "@paperback/types";

import { SiteInterceptor, persistCloudflareCookies } from "../utils/interceptor";
import { fetchCheerio } from "../utils/network";
import { MangaFoxAdvancedSearchForm } from "./forms/search";
import { DOMAIN, GENRES, type Metadata, type SearchMetadata } from "./models";
import {
  LAYOUT_COMPACT,
  LAYOUT_COMPACT_WITH_CHAPTER,
  LAYOUT_DETAILED,
  parseChapters,
  parseListing,
  parseMangaDetails,
  parseNextPage,
  type ListingEntry,
} from "./parsers";
import type MangaFoxConfig from "./pbconfig";
import { extractChapterPages } from "./reader";

const SECTION_HOT = "hot-release";
const SECTION_NEW = "new-manga";
const SECTION_LATEST = "latest-updates";
const SECTION_GENRES = "genres";

export class MangaFoxExtension implements ExtensionImpl<typeof MangaFoxConfig> {
  // Paginated chapters cost one request per page, so this budget sets how fast a
  // chapter opens rather than merely pacing background traffic.
  private readonly rateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 12,
    bufferInterval: 1,
    ignoreImages: true,
  });

  private readonly interceptor = new SiteInterceptor("main", {
    domain: DOMAIN,
    // isAdult unlocks the mature listings.
    cookies: { isAdult: "1" },
  });

  private readonly cookieStorage = new CookieStorageInterceptor({ storage: "stateManager" });

  async initialise(): Promise<void> {
    this.rateLimiter.registerInterceptor();
    this.interceptor.registerInterceptor();
    this.cookieStorage.registerInterceptor();
  }

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    persistCloudflareCookies(cookies, this.cookieStorage);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: SECTION_HOT, title: "Hot Release", type: DiscoverSectionType.featured },
      { id: SECTION_NEW, title: "New Manga", type: DiscoverSectionType.prominentCarousel },
      { id: SECTION_LATEST, title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
      { id: SECTION_GENRES, title: "Genres", type: DiscoverSectionType.genres },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id === SECTION_GENRES) {
      return {
        items: GENRES.map((genre) => ({
          type: "genresCarouselItem" as const,
          name: genre.title,
          // Must be `metadata`: a `filters` key leaves the selection empty and the
          // endpoint quietly answers with its default listing.
          searchQuery: { title: "", metadata: { genres: [genre.id] } },
        })),
      };
    }

    const page = metadata?.page ?? 1;
    const seenIds = metadata?.collectedIds ?? [];

    switch (section.id) {
      case SECTION_HOT: {
        const $ = await fetchCheerio(DOMAIN);
        return { items: toDiscoverItems(parseListing($, LAYOUT_COMPACT, seenIds), section) };
      }

      case SECTION_NEW: {
        const $ = await fetchCheerio(directoryUrl(page));
        const items = parseListing($, LAYOUT_COMPACT_WITH_CHAPTER, seenIds);
        return { items: toDiscoverItems(items, section), metadata: nextMetadata($, page, seenIds) };
      }

      case SECTION_LATEST: {
        const $ = await fetchCheerio(releasesUrl(page));
        const items = parseListing($, LAYOUT_DETAILED, seenIds);
        return { items: toDiscoverItems(items, section), metadata: nextMetadata($, page, seenIds) };
      }

      default:
        return { items: [] };
    }
  }

  async getAdvancedSearchForm(query: SearchQuery<SearchMetadata>): Promise<AdvancedSearchForm> {
    return new MangaFoxAdvancedSearchForm(query);
  }

  async getSearchResults(
    query: SearchQuery<SearchMetadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const seenIds = metadata?.collectedIds ?? [];

    const url = new URL(DOMAIN).addPathComponent("search");
    if (page > 1) url.setQueryItem("page", page.toString());

    const genre = query.metadata?.genres?.[0];
    if (genre) url.setQueryItem("genres", genre);
    // The site filters by numeric id; the rating classifier needs the genre name.
    const genreTitle = GENRES.find((entry) => entry.id === genre)?.title;
    if (query.title?.trim()) url.setQueryItem("title", query.title);

    const $ = await fetchCheerio(url.toString());

    return {
      items: parseListing($, LAYOUT_DETAILED, seenIds, genreTitle),
      metadata: nextMetadata($, page, seenIds),
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const $ = await fetchCheerio(mangaUrl(mangaId));
    return parseMangaDetails($, mangaId);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const $ = await fetchCheerio(mangaUrl(sourceManga.mangaId));
    return parseChapters($, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = new URL(DOMAIN)
      .addPathComponent("manga")
      .addPathComponent(chapter.sourceManga.mangaId)
      .addPathComponent(chapter.chapterId)
      // Required, not optional: without it the site relies on a redirect that never
      // fires for ids containing a dot ("c001.1" reads as a file extension). It also
      // keeps the chapter segment in the URL, which extractChapterPages needs.
      .addPathComponent("1.html")
      .toString();

    const pages = await extractChapterPages(await fetchCheerio(url), url);
    if (pages.length === 0) {
      throw new Error(`No pages found for chapter ${chapter.chapterId}`);
    }

    return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
  }
}

function mangaUrl(mangaId: string): string {
  return new URL(DOMAIN).addPathComponent("manga").addPathComponent(mangaId).toString();
}

function directoryUrl(page: number): string {
  const url = new URL(DOMAIN).addPathComponent("directory");
  url.addPathComponent(page > 1 ? `${page}.html?news` : "?news");
  return url.toString();
}

function releasesUrl(page: number): string {
  const url = new URL(DOMAIN).addPathComponent("releases");
  if (page > 1) url.addPathComponent(`${page}.html`);
  return url.toString();
}

function nextMetadata(
  $: Parameters<typeof parseNextPage>[0],
  page: number,
  seenIds: string[],
): Metadata | undefined {
  const next = parseNextPage($, page);
  return next ? { page: next, collectedIds: seenIds } : undefined;
}

function toDiscoverItems(entries: ListingEntry[], section: DiscoverSection): DiscoverSectionItem[] {
  return entries.map((entry) => {
    switch (section.type) {
      case DiscoverSectionType.featured:
        return { ...entry, supertitle: entry.subtitle, type: "featuredCarouselItem" as const };
      case DiscoverSectionType.chapterUpdates:
        return { ...entry, chapterId: "", type: "chapterUpdatesCarouselItem" as const };
      case DiscoverSectionType.prominentCarousel:
        return { ...entry, type: "prominentCarouselItem" as const };
      default:
        return { ...entry, type: "simpleCarouselItem" as const };
    }
  });
}

export const MangaFox = new MangaFoxExtension();
