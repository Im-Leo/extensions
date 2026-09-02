/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  BasicRateLimiter,
  CookieStorageInterceptor,
  DiscoverSectionType,
  type AdvancedSearchForm,
  type Chapter,
  type ChapterDetails,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type PagedResults,
  type Request,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";

import { SiteInterceptor, persistCloudflareCookies } from "../utils/interceptor";
import { FlameAdvancedSearchForm } from "./forms/search";
import { DOMAIN } from "./models";
import type {
  ChapterReaderResponse,
  FlameFilter,
  HomepageResponse,
  LatestProps,
  Metadata,
  SearchMetadata,
  SearchProps,
  SeriesDetailResponse,
  SimpleSeriesListItem,
  SortableListItem,
} from "./models";
import { fetchNextData, fetchSimpleSeries } from "./network";
import {
  applyAdvancedFilters,
  buildFilterOptions,
  enrichLatestWithBrowseData,
  isNovel,
  parseChapterDetails,
  parseChapters,
  parseHomepageSection,
  parseSeriesDetail,
  toSearchResultItem,
  toSortableList,
} from "./parsers";
import type FlameComicsConfig from "./pbconfig";

const SECTION_POPULAR = "popular";
const SECTION_LATEST = "latest";
const SECTION_STAFF = "staff";

const CANDIDATES_CACHE_TTL = 5 * 60 * 1000;
const PAGE_SIZE = 100;

export class FlameComicsExtension implements ExtensionImpl<typeof FlameComicsConfig> {
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 10,
    bufferInterval: 1,
    ignoreImages: true,
  });

  cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  flameInterceptor = new SiteInterceptor("main", { domain: DOMAIN });

  /** The whole catalogue, aggregated once and reused for search, filters and sort. */
  private candidateCache: {
    data: { candidates: SortableListItem[]; params: FlameFilter };
    timestamp: number;
  } | null = null;

  private isCacheValid(): boolean {
    return (
      !!this.candidateCache && Date.now() - this.candidateCache.timestamp < CANDIDATES_CACHE_TTL
    );
  }

  async initialise(): Promise<void> {
    this.globalRateLimiter.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.flameInterceptor.registerInterceptor();
  }

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    persistCloudflareCookies(cookies, this.cookieStorageInterceptor);
  }

  /** Latest supplies recency, browse supplies metadata, `/api/series` supplies counts. */
  private async refreshCandidateCache(): Promise<SortableListItem[]> {
    const [latest, browse, simple] = await Promise.all([
      fetchNextData<LatestProps>(["latest.json"]),
      fetchNextData<SearchProps>(["browse.json"]),
      fetchSimpleSeries<SimpleSeriesListItem[]>(),
    ]);

    const nonNovels = latest.pageProps.allSeries.filter((s) => !isNovel(s));
    const enriched = enrichLatestWithBrowseData(nonNovels, browse.pageProps.series);
    const candidates = toSortableList(enriched, simple);
    const params = buildFilterOptions(candidates, browse.pageProps.initialFilters);

    this.candidateCache = { data: { candidates, params }, timestamp: Date.now() };
    return candidates;
  }

  private async getCandidates(): Promise<SortableListItem[]> {
    if (this.isCacheValid()) return [...this.candidateCache!.data.candidates];
    return this.refreshCandidateCache();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: SECTION_POPULAR, title: "Popular", type: DiscoverSectionType.featured },
      { id: SECTION_LATEST, title: "Latest Updates", type: DiscoverSectionType.chapterUpdates },
      { id: SECTION_STAFF, title: "Staff Picks", type: DiscoverSectionType.prominentCarousel },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const homepage = await fetchNextData<HomepageResponse>(["index.json"]);
    return parseHomepageSection(section.id, homepage);
  }

  async getSearchResults(
    searchQuery: SearchQuery<SearchMetadata>,
    metadata: Metadata | undefined,
    sortingOption: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const title = (searchQuery.title ?? "").trim().toLowerCase();

    let candidates = await this.getCandidates();

    if (title.length > 0) {
      candidates = candidates.filter((c) => c.title.toLowerCase().includes(title));
    }

    // Filter before paginating, so pages stay dense and the next-page flag is honest.
    if (searchQuery.metadata && this.candidateCache) {
      candidates = applyAdvancedFilters(
        candidates,
        searchQuery.metadata,
        this.candidateCache.data.params,
      );
    }

    switch (sortingOption.id) {
      case "latest":
        candidates.sort((a, b) => (b.updated ?? b.last_edit) - (a.updated ?? a.last_edit));
        break;
      case "title_asc":
        candidates.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title_desc":
        candidates.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "likes":
        candidates.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
        break;
      case "year":
        candidates.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        break;
      case "random":
        // Fisher-Yates. Both indices are in range by construction, but the compiler
        // cannot see that, so each element is bound before the swap.
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const current = candidates[i];
          const swap = candidates[j];
          if (current && swap) {
            candidates[i] = swap;
            candidates[j] = current;
          }
        }
        break;
    }

    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const items = candidates
      .slice(startIndex, endIndex)
      .map((c) => toSearchResultItem(c, sortingOption));

    return { items, metadata: endIndex < candidates.length ? { page: page + 1 } : undefined };
  }

  async getAdvancedSearchForm(
    searchQuery: SearchQuery<SearchMetadata>,
  ): Promise<AdvancedSearchForm> {
    if (!this.isCacheValid()) await this.refreshCandidateCache();
    return new FlameAdvancedSearchForm(searchQuery, this.candidateCache?.data.params);
  }

  async getSortingOptions(_query: SearchQuery<SearchMetadata>): Promise<SortingOption[]> {
    return [
      { id: "latest", label: "Latest Update" },
      { id: "title_asc", label: "Title ↑" },
      { id: "title_desc", label: "Title ↓" },
      { id: "likes", label: "Most Liked" },
      { id: "year", label: "Year" },
      { id: "random", label: "Random" },
    ];
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    // One route returns the series and its chapter list together.
    const response = await fetchNextData<SeriesDetailResponse>(["series", `${mangaId}.json`], {
      id: mangaId,
    });
    return parseSeriesDetail(mangaId, response);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const response = await fetchNextData<SeriesDetailResponse>(
      ["series", `${sourceManga.mangaId}.json`],
      { id: sourceManga.mangaId },
    );
    return parseChapters(sourceManga, response);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    // Chapters carry "<series_id>:<token>"; entries from before that packing fall
    // back to additionalInfo.
    const [seriesIdPart, tokenPart] = chapter.chapterId.split(":");
    const seriesId = seriesIdPart ?? chapter.sourceManga?.mangaId;
    const token =
      tokenPart ??
      (typeof chapter.additionalInfo?.["token"] === "string"
        ? chapter.additionalInfo["token"]
        : undefined);

    if (!seriesId || !token) {
      throw new Error(
        `[FlameComics] Cannot fetch chapter — missing series_id/token in chapterId=${chapter.chapterId}`,
      );
    }

    const response = await fetchNextData<ChapterReaderResponse>(
      ["series", String(seriesId), `${token}.json`],
      { id: String(seriesId), token },
    );
    return parseChapterDetails(chapter.chapterId, response);
  }
}

export const FlameComics = new FlameComicsExtension();
