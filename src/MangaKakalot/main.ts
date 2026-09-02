/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  BasicRateLimiter,
  type ContentRating,
  CookieStorageInterceptor,
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

import { learnMissingRatings } from "../utils/content-rating";
import { SiteInterceptor, persistCloudflareCookies } from "../utils/interceptor";
import { fetchCheerio, fetchJSON } from "../utils/network";
import { MangaKakalotAdvancedSearchForm } from "./forms/search";
import {
  DISCOVER_SECTIONS,
  DOMAIN,
  type ChapterListResponse,
  type Metadata,
  type SearchMetadata,
} from "./models";
import {
  applyLearnedRatings,
  isLastPage,
  parseChapterDetails,
  parseChapterList,
  parseDiscoverSectionItems,
  parseGenres,
  parseMangaDetails,
  parseSearchResults,
  ratableIds,
  ratingCache,
} from "./parsers";
import type MangaKakalotConfig from "./pbconfig";

/** The chapter API is unpaginated in practice; one oversized page fetches all. */
const CHAPTER_PAGE_SIZE = 9000;

export class MangaKakalotExtension implements ExtensionImpl<typeof MangaKakalotConfig> {
  private readonly rateLimiter = new BasicRateLimiter("ratelimiter", {
    // Kept below what the site tolerates: this is the one Cloudflare-protected
    // source, and a re-triggered challenge fails it closed rather than slowing it.
    numberOfRequests: 8,
    bufferInterval: 1,
    ignoreImages: true,
  });

  private readonly interceptor = new SiteInterceptor("main", {
    domain: DOMAIN,
    bypassPage: `${DOMAIN}/manga`,
    // A stale or bad path answers 404 with a page that still parses, so a non-200
    // has to fail loudly rather than yield blank fields.
    requireOk: true,
  });

  /** Persists `cf_clearance` so a solved challenge survives an app restart. */
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
    return DISCOVER_SECTIONS.map(({ id, title, type }) => ({ id, title, type }));
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const definition = DISCOVER_SECTIONS.find(({ id }) => id === section.id);
    if (!definition) throw new Error(`Unknown discover section: ${section.id}`);

    const page = metadata?.page ?? 1;
    const $ = await fetchCheerio(`${DOMAIN}/manga-list/${definition.path}?page=${page}`);

    return {
      items: await this.withRealRatings(parseDiscoverSectionItems($, section)),
      metadata: isLastPage($) ? undefined : { page: page + 1 },
    };
  }

  async getAdvancedSearchForm(query: SearchQuery<SearchMetadata>): Promise<AdvancedSearchForm> {
    const genres = parseGenres(await fetchCheerio(DOMAIN));
    genres.tags.sort((a, b) => a.title.localeCompare(b.title));

    return new MangaKakalotAdvancedSearchForm(query, genres);
  }

  async getSearchResults(
    query: SearchQuery<SearchMetadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const $ = await fetchCheerio(this.buildSearchUrl(query, page));

    return {
      items: await this.withRealRatings(
        parseSearchResults($, Boolean(query.title), query.metadata?.genres?.[0]),
      ),
      metadata: isLastPage($) ? undefined : { page: page + 1 },
    };
  }

  /**
   * Rates listing tiles from their own genres.
   *
   * Listing markup carries none, so each unknown title's detail page is read;
   * the cache bounds that to one fetch per title.
   */
  private async withRealRatings<T extends { contentRating?: ContentRating }>(
    items: T[],
  ): Promise<T[]> {
    await learnMissingRatings(ratableIds(items), ratingCache, (mangaId) =>
      this.getMangaDetails(mangaId),
    );

    return applyLearnedRatings(items);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    return parseMangaDetails(await fetchCheerio(`${DOMAIN}/manga/${mangaId}`), mangaId);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const response = await fetchJSON<ChapterListResponse>(
      `${DOMAIN}/api/manga/${sourceManga.mangaId}/chapters?limit=${CHAPTER_PAGE_SIZE}&offset=0`,
    );

    return parseChapterList(response, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const $ = await fetchCheerio(
      `${DOMAIN}/manga/${chapter.sourceManga.mangaId}/${chapter.chapterId}`,
    );

    return parseChapterDetails($, chapter);
  }

  /**
   * Title search, genre browse and the default listing are three separate
   * endpoints; the site has no combined query.
   */
  private buildSearchUrl(query: SearchQuery<SearchMetadata>, page: number): string {
    const url = new URL(DOMAIN);
    const genre = query.metadata?.genres?.[0];

    if (query.title) {
      url.addPathComponent("search");
      url.addPathComponent("story");
      url.addPathComponent(encodeURIComponent(sanitizeQuery(query.title)));
    } else if (genre) {
      url.addPathComponent("genre");
      url.addPathComponent(genre);
    } else {
      url.addPathComponent("manga-list");
      url.addPathComponent("latest-manga");
    }

    url.setQueryItem("page", page.toString());
    return url.toString();
  }
}

/** Apostrophes and dots break the search path; quotes are rejected outright. */
function sanitizeQuery(title: string): string {
  return title
    .replace(/'[^ ]*/g, "")
    .replace(/\.+/g, "")
    .replace(/["']/g, "")
    .trim();
}

export const MangaKakalot = new MangaKakalotExtension();
