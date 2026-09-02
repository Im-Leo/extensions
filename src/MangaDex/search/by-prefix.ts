/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { PagedResults, SearchResultItem } from "@paperback/types";

import { fetchCustomListMangaIds } from "../curated-lists";
import type { ChapterResponse, Metadata } from "../models";
import { fetchJSON } from "../network";
import { collectUniqueMangaIdsFromChapters } from "../relationships";
import { buildLatestChaptersUrl } from "../urls";
import { computeNextMetadata, MANGA_PAGE_LIMIT } from "../utils";
import { fetchAndEnrichOrderedMangaIds } from "./fetchers";

/**
 * The `usr:` and `list:` searches, which address a feed rather than the search
 * endpoint and so have to page it themselves.
 */

/** An uploader search walks the feed, so it is capped rather than exhaustive. */
const UPLOADER_FETCH_PAGE_CAP = 3;

export async function searchByUploader(
  uploaderUuid: string,
  metadata: Metadata | undefined,
  ratings: string[],
  languages: string[],
): Promise<PagedResults<SearchResultItem>> {
  let offset = metadata?.offset ?? 0;

  for (let attempt = 0; attempt < UPLOADER_FETCH_PAGE_CAP; attempt++) {
    const chaptersResponse = await fetchJSON<ChapterResponse>({
      url: buildLatestChaptersUrl({
        limit: MANGA_PAGE_LIMIT,
        offset,
        languages,
        ratings,
        uploaders: [uploaderUuid],
        includes: ["manga"],
      }).toString(),
      method: "GET",
    });

    if (!Array.isArray(chaptersResponse.data)) {
      return { items: [], metadata: undefined };
    }

    const chapters = chaptersResponse.data;
    const nextMetadata = computeNextMetadata(
      offset,
      chapters.length,
      chaptersResponse.total,
      MANGA_PAGE_LIMIT,
    );
    if (chapters.length === 0) {
      return { items: [], metadata: nextMetadata };
    }

    const { ids: orderedMangaIds } = collectUniqueMangaIdsFromChapters(chapters);

    const items = await fetchAndEnrichOrderedMangaIds(orderedMangaIds, ratings, languages);
    if (items.length > 0 || nextMetadata === undefined) {
      return { items, metadata: nextMetadata };
    }

    offset = nextMetadata.offset ?? offset + MANGA_PAGE_LIMIT;
  }

  return { items: [], metadata: { offset } };
}

const LIST_FETCH_PAGE_CAP = 3;

export async function searchByList(
  listUuid: string,
  metadata: Metadata | undefined,
  ratings: string[],
  languages: string[],
): Promise<PagedResults<SearchResultItem>> {
  let offset = metadata?.offset ?? 0;

  let allMangaIds = metadata?.listMangaIds;
  if (!allMangaIds) {
    const fetched = await fetchCustomListMangaIds(listUuid);
    if (fetched === null) {
      return { items: [], metadata: undefined };
    }
    allMangaIds = fetched;
  }

  if (allMangaIds.length === 0) {
    return { items: [], metadata: undefined };
  }

  for (let attempt = 0; attempt < LIST_FETCH_PAGE_CAP; attempt++) {
    const slice = allMangaIds.slice(offset, offset + MANGA_PAGE_LIMIT);
    if (slice.length === 0) {
      return { items: [], metadata: undefined };
    }

    const nextOffset = offset + slice.length;
    const nextMetadata: Metadata | undefined =
      nextOffset < allMangaIds.length
        ? { offset: nextOffset, listMangaIds: allMangaIds }
        : undefined;

    const items = await fetchAndEnrichOrderedMangaIds(slice, ratings, languages);
    if (items.length > 0 || nextMetadata === undefined) {
      return { items, metadata: nextMetadata };
    }

    offset = nextOffset;
  }

  return { items: [], metadata: { offset, listMangaIds: allMangaIds } };
}
