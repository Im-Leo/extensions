/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  BasicRateLimiter,
  DiscoverSectionType,
  type AdvancedSearchForm,
  type Chapter,
  type ChapterDetails,
  type ChapterReadActionQueueProcessingResult,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type Form,
  type MangaProgress,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
  type TagSection,
  type TrackedMangaChapterReadAction,
} from "@paperback/types";

import { rateContent } from "../utils/content-rating";
import { SiteInterceptor } from "../utils/interceptor";
import { TrackingForm } from "./forms/progress";
import { AsuraScansAdvancedSearchForm } from "./forms/search";
import { AsuraSettingForm, getAccessToken, getShowUpcomingChapters } from "./forms/settings";
import {
  AS_DOMAIN,
  TagSectionId,
  statuses,
  types,
  type AsuraChapterResponse,
  type AsuraCreatorRequest,
  type AsuraGenre,
  type AsuraManga,
  type AsuraMetadata,
  type AsuraSearchResult,
  type PageData,
  type SearchMetadata,
} from "./models";
import {
  genreNames,
  latestChapterSubtitle,
  parseChapters,
  parseMangaDetails,
  toCreatorTags,
  toSearchResultItem,
} from "./parsers";
import type AsuraConfig from "./pbconfig";
import { descramblePage } from "./reader";
import { getMangaProgress, processChapterReadActionQueue } from "./tracking";
import {
  chapterListUrl,
  chapterUrl,
  creatorsUrl,
  genresUrl,
  listingUrl,
  searchUrl,
  seriesUrl,
  trendingUrl,
} from "./urls";

const PAGE_SIZE = 20;

/** Required by the reader endpoint; the API rejects a request without it. */
const PAGE_TOKEN = "asura-reader-2026";

export class AsuraScansExtension implements ExtensionImpl<typeof AsuraConfig> {
  private readonly rateLimiter = new BasicRateLimiter("ratelimiter", {
    numberOfRequests: 6,
    bufferInterval: 1,
    // Covers must not queue behind the request budget; this CDN needs no throttle.
    ignoreImages: true,
  });

  private readonly interceptor = new SiteInterceptor("main", { domain: AS_DOMAIN });

  async initialise(): Promise<void> {
    this.rateLimiter.registerInterceptor();
    this.interceptor.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new AsuraSettingForm();
  }

  getMangaShareUrl(mangaId: string): string {
    return `${AS_DOMAIN}/comics/${mangaId}`;
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "featured", title: "Popular Today", type: DiscoverSectionType.featured },
      { id: "latest_updates", title: "Latest Updates", type: DiscoverSectionType.chapterUpdates },
      {
        id: "popular_today",
        title: "Popular of All Time",
        type: DiscoverSectionType.simpleCarousel,
      },
      { id: "type", title: "Types", type: DiscoverSectionType.genres },
      { id: "genres", title: "Genres", type: DiscoverSectionType.genres },
      { id: "status", title: "Status", type: DiscoverSectionType.genres },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: AsuraMetadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.type === DiscoverSectionType.genres) return this.getGenreSectionItems(section.id);

    const page = metadata?.page ?? 0;

    if (section.type === DiscoverSectionType.featured) {
      const trending = await this.requestJSON<AsuraSearchResult>(trendingUrl());

      return {
        items: trending.data.map((manga) => ({
          type: "featuredCarouselItem" as const,
          mangaId: manga.slug,
          title: manga.title,
          imageUrl: manga.cover_url ?? manga.cover,
          contentRating: rateContent(genreNames(manga)),
        })),
      };
    }

    const sort = section.type === DiscoverSectionType.chapterUpdates ? "latest" : "popular";
    const listing = await this.requestJSON<AsuraSearchResult>(
      listingUrl(sort, page * (metadata?.per_page ?? PAGE_SIZE), PAGE_SIZE),
    );

    const items: DiscoverSectionItem[] = listing.data.map((manga) => {
      const shared = {
        mangaId: manga.slug,
        title: manga.title,
        imageUrl: manga.cover,
        subtitle: latestChapterSubtitle(manga),
        contentRating: rateContent(genreNames(manga)),
      };

      return section.type === DiscoverSectionType.chapterUpdates
        ? {
            ...shared,
            type: "chapterUpdatesCarouselItem" as const,
            chapterId: manga.latest_chapters?.[0]?.id.toString() ?? "",
          }
        : { ...shared, type: "simpleCarouselItem" as const };
    });

    return {
      items,
      metadata: listing.meta.has_more
        ? { page: page + 1, per_page: listing.meta.per_page }
        : undefined,
    };
  }

  async getSearchTags(): Promise<TagSection[]> {
    const cached = Application.getState("tags") as TagSection[] | undefined;
    if (cached) return cached;

    const genres = await this.requestJSON<{ data: AsuraGenre[] }>(genresUrl());
    const creators = await this.requestJSON<{ data: AsuraCreatorRequest }>(creatorsUrl());

    const sections: TagSection[] = [
      {
        id: TagSectionId.Genres,
        title: "Genres",
        tags: genres.data.map((genre) => ({ id: genre.slug, title: genre.name })),
      },
      { id: TagSectionId.SeriesStatus, title: "Status", tags: statuses },
      { id: TagSectionId.SeriesType, title: "Type", tags: types },
      { id: "min_chapters", title: "Minimum Chapters", tags: [] },
      { id: "artist", title: "Artist", tags: toCreatorTags(creators.data.artists) },
      { id: "author", title: "Author", tags: toCreatorTags(creators.data.authors) },
    ];

    Application.setState(sections, "tags");
    return sections;
  }

  async supportsTagExclusion(): Promise<boolean> {
    return false;
  }

  async getAdvancedSearchForm(
    searchQuery: SearchQuery<SearchMetadata>,
  ): Promise<AdvancedSearchForm> {
    return new AsuraScansAdvancedSearchForm(searchQuery, await this.getSearchTags());
  }

  async getSortingOptions(_query: SearchQuery<SearchMetadata>): Promise<SortingOption[]> {
    return [
      { id: "latest", label: "Latest Update" },
      { id: "popular", label: "Popular" },
      { id: "rating", label: "Rating" },
      { id: "title", label: "A-Z" },
      { id: "newest", label: "Newest" },
    ];
  }

  async getSearchResults(
    query: SearchQuery<SearchMetadata>,
    metadata: AsuraMetadata | undefined,
    sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 0;
    const listing = await this.requestJSON<AsuraSearchResult>(
      searchUrl(query, sortingOption, page * (metadata?.per_page ?? PAGE_SIZE), PAGE_SIZE),
    );

    if (listing.data === null) return { items: [], metadata: undefined };

    return {
      items: listing.data.map((manga) => toSearchResultItem(manga)),
      metadata: listing.meta.has_more ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { series } = await this.requestJSON<{ series: AsuraManga }>(seriesUrl(mangaId));

    return parseMangaDetails(series);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const response = await this.requestJSON<AsuraChapterResponse>(
      chapterListUrl(sourceManga.mangaId),
    );

    return parseChapters(response, sourceManga, getShowUpcomingChapters());
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const accessToken = (await getAccessToken()) ?? "";
    if (chapter.additionalInfo?.["early_access"] && !accessToken) {
      throw new Error(
        `Chapter is early access. Sign in at ${AS_DOMAIN} to read early access chapters.`,
      );
    }

    const [, buffer] = await Application.scheduleRequest({
      url: chapterUrl(chapter.sourceManga.mangaId, chapter.chapNum),
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Page-Token": PAGE_TOKEN,
      },
    });

    const payload = JSON.parse(Application.arrayBufferToUTF8String(buffer)) as {
      data: { chapter: { pages: PageData[] } };
    };

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: await Promise.all(payload.data.chapter.pages.map(descramblePage)),
    };
  }

  async getMangaProgressManagementForm(sourceManga: SourceManga): Promise<Form> {
    return new TrackingForm(sourceManga);
  }

  async getMangaProgress(sourceManga: SourceManga): Promise<MangaProgress> {
    return getMangaProgress(sourceManga);
  }

  async processChapterReadActionQueue(
    actions: TrackedMangaChapterReadAction[],
  ): Promise<ChapterReadActionQueueProcessingResult> {
    return processChapterReadActionQueue(actions);
  }

  private async getGenreSectionItems(
    sectionId: string,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const tags = await this.getSearchTags();

    const sectionToTag: Record<string, [TagSectionId, keyof SearchMetadata]> = {
      genres: [TagSectionId.Genres, "genres"],
      status: [TagSectionId.SeriesStatus, "seriesStatus"],
      type: [TagSectionId.SeriesType, "seriesType"],
    };

    const mapping = sectionToTag[sectionId];
    if (!mapping) return { items: [] };

    const [tagSectionId, metadataKey] = mapping;
    const section = tags.find((tag) => tag.id === tagSectionId);

    return {
      items: (section?.tags ?? []).map((tag) => ({
        type: "genresCarouselItem" as const,
        name: tag.title,
        searchQuery: { title: "", metadata: { [metadataKey]: [tag.id] } },
      })),
    };
  }

  private async requestJSON<T>(url: string): Promise<T> {
    const [, buffer] = await Application.scheduleRequest({ url, method: "GET" });
    return JSON.parse(Application.arrayBufferToUTF8String(buffer)) as T;
  }
}

export const AsuraScans = new AsuraScansExtension();
