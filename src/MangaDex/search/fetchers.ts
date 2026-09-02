/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { SearchResultItem } from "@paperback/types";

import type {
  ChapterAttributes,
  ChapterData,
  ChapterResponse,
  MangaItem,
  SearchResponse,
  StatisticsResponse,
} from "../models";
import { fetchJSON } from "../network";
import { parseMangaList } from "../parsers";
import { findMangaRelationshipId } from "../relationships";
import {
  getSearchThumbnail,
  getShowChapter,
  getShowSearchRatingInSubtitle,
  getShowVolume,
} from "../state";
import {
  buildChapterBatchUrl,
  buildChapterByIdUrl,
  buildMangaListUrl,
  buildStatisticsBatchUrl,
} from "../urls";
import { reorderById } from "../utils";

/**
 * The requests behind a search result page.
 *
 * A manga list and its statistics come from separate endpoints, so each page is
 * two round trips batched rather than one call per title.
 */

/** Statistics arrive from a second endpoint, batched to one call per page. */
export async function enrichAndParseMangaResults(
  mangaItems: MangaItem[],
  ratings: string[],
  languages: string[],
  queryTitle: string | undefined,
): Promise<SearchResultItem[]> {
  if (mangaItems.length === 0) return [];

  const wantRating = getShowSearchRatingInSubtitle();
  const chapterIds = mangaItems
    .map((manga) => manga.attributes?.latestUploadedChapter)
    .filter((id): id is string => !!id);
  const wantChapterDetails = (getShowVolume() || getShowChapter()) && chapterIds.length > 0;

  const ratingPromise: Promise<StatisticsResponse | undefined> = wantRating
    ? fetchJSON<StatisticsResponse>({
        url: buildStatisticsBatchUrl(mangaItems.map((m) => m.id)).toString(),
        method: "GET",
      }).catch(() => undefined)
    : Promise.resolve(undefined);

  const chaptersPromise: Promise<ChapterResponse | undefined> = wantChapterDetails
    ? fetchJSON<ChapterResponse>({
        url: buildChapterBatchUrl({
          chapterIds,
          languages,
          ratings,
        }).toString(),
        method: "GET",
      }).catch(() => undefined)
    : Promise.resolve(undefined);

  const [ratingJson, chaptersResponse] = await Promise.all([ratingPromise, chaptersPromise]);

  let chapterDetailsMap: Record<string, ChapterAttributes> | undefined;
  if (chaptersResponse && Array.isArray(chaptersResponse.data)) {
    chapterDetailsMap = {};
    for (const chapter of chaptersResponse.data) {
      if (!chapter || !chapter.attributes) continue;
      chapterDetailsMap[chapter.id] = chapter.attributes;
    }
  }

  return parseMangaList(mangaItems, getSearchThumbnail, queryTitle, ratingJson, chapterDetailsMap);
}

export async function fetchAndEnrichOrderedMangaIds(
  orderedIds: readonly string[],
  ratings: string[],
  languages: string[],
): Promise<SearchResultItem[]> {
  if (orderedIds.length === 0) return [];

  const mangaResponse = await fetchJSON<SearchResponse>({
    url: buildMangaListUrl({
      limit: orderedIds.length,
      ratings,
      languages,
      ids: orderedIds,
    }).toString(),
    method: "GET",
  });

  if (!Array.isArray(mangaResponse.data)) return [];

  return enrichAndParseMangaResults(
    reorderById(mangaResponse.data, orderedIds),
    ratings,
    languages,
    undefined,
  );
}

/** A `ch:` search names a chapter; the app can only open the manga holding it. */
export async function resolveChapterToManga(chapterId: string): Promise<string | undefined> {
  try {
    const json = await fetchJSON<{ data?: ChapterData }>({
      url: buildChapterByIdUrl(chapterId, ["manga"]).toString(),
      method: "GET",
    });
    return findMangaRelationshipId(json.data?.relationships);
  } catch {
    return undefined;
  }
}
