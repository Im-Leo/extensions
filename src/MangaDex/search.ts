/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type {
  AdvancedSearchForm,
  PagedResults,
  SearchQuery,
  SearchResultItem,
  SortingOption,
  TagSection,
} from "@paperback/types";

import { MangaDexAdvancedSearchForm, type MangaDexSearchMetadata } from "./forms/search";
import { normalizeUuid, resolveChapterId, resolveMangaId, UUID_SEARCH_RE } from "./legacy";
import type { Metadata, SearchResponse } from "./models";
import { fetchJSON } from "./network";
import { dispatchSearch, type DispatchedSearch } from "./search-dispatch";
import { searchByList, searchByUploader } from "./search/by-prefix";
import { enrichAndParseMangaResults, resolveChapterToManga } from "./search/fetchers";
import {
  applyTagFilters,
  expandOriginalLanguages,
  parseYearInput,
  resolveSortOrder,
} from "./search/filters";
import { getLanguages, getRatings } from "./state";
import { getSearchTagSections } from "./tags";
import { buildMangaListUrl } from "./urls";
import { MANGA_PAGE_LIMIT, computeNextMetadata } from "./utils";

export async function getSearchTags(): Promise<TagSection[]> {
  return getSearchTagSections(getRatings());
}

export async function getAdvancedSearchForm(
  query: SearchQuery<MangaDexSearchMetadata>,
): Promise<AdvancedSearchForm> {
  const tagSections = await getSearchTags();
  return new MangaDexAdvancedSearchForm(query, tagSections);
}

export async function getSearchResults(
  query: SearchQuery<MangaDexSearchMetadata>,
  metadata: Metadata | undefined,
  sortingOption: SortingOption | undefined,
): Promise<PagedResults<SearchResultItem>> {
  const languages: string[] = getLanguages();
  const offset: number = metadata?.offset ?? 0;
  const meta = query.metadata;

  const { ratings, includedTags, excludedTags } = applyTagFilters(meta?.tagsByGroup, getRatings());
  if (ratings.length === 0) {
    return { items: [], metadata: undefined };
  }

  const dispatched: DispatchedSearch | undefined = dispatchSearch(query.title);

  if (dispatched?.prefix === "usr") {
    return searchByUploader(dispatched.uuid, metadata, ratings, languages);
  }
  if (dispatched?.prefix === "list") {
    return searchByList(dispatched.uuid, metadata, ratings, languages);
  }

  let searchByIdsValue: string | undefined;
  let searchTitleValue: string | undefined;
  if (dispatched?.prefix === "id") {
    try {
      searchByIdsValue = await resolveMangaId(dispatched.uuid);
    } catch {
      return { items: [], metadata: undefined };
    }
  } else if (dispatched?.prefix === "ch") {
    let chapterUuid: string;
    try {
      chapterUuid = await resolveChapterId(dispatched.uuid);
    } catch {
      return { items: [], metadata: undefined };
    }
    const mangaUuid = await resolveChapterToManga(chapterUuid);
    if (!mangaUuid) return { items: [], metadata: undefined };
    searchByIdsValue = mangaUuid;
  } else if (!dispatched) {
    const bareUuidMatch = query.title?.match(UUID_SEARCH_RE);
    if (bareUuidMatch) {
      searchByIdsValue = bareUuidMatch[0].toLowerCase();
    } else {
      searchTitleValue = query.title?.trim() || undefined;
    }
  }

  const includedTagsMode = meta?.includeOperator?.[0];
  const excludedTagsMode = meta?.excludeOperator?.[0];

  const isTitleSearch = !!searchTitleValue;
  const { orderKey, orderValue } = resolveSortOrder(sortingOption, isTitleSearch);

  const isExactIdLookup = !!searchByIdsValue;
  const hasAvailableChapters = isExactIdLookup ? undefined : (meta?.hasAvailableChapters ?? true);
  const demographics = isExactIdLookup ? [] : (meta?.demographics ?? []);
  const statuses = isExactIdLookup ? [] : (meta?.statuses ?? []);
  const originalLanguages = isExactIdLookup
    ? []
    : expandOriginalLanguages(meta?.originalLanguages ?? []);
  const year = isExactIdLookup ? undefined : parseYearInput(meta?.year);
  const formAuthorOrArtist = isExactIdLookup ? undefined : normalizeUuid(meta?.authorOrArtist);
  const formGroup = isExactIdLookup ? undefined : normalizeUuid(meta?.group);
  const authorOrArtist = dispatched?.prefix === "author" ? dispatched.uuid : formAuthorOrArtist;
  const group = dispatched?.prefix === "grp" ? dispatched.uuid : formGroup;

  const url = buildMangaListUrl({
    limit: MANGA_PAGE_LIMIT,
    offset,
    ratings,
    languages,
    hasAvailableChapters,
    orderKey,
    orderValue,
    demographics,
    statuses,
    originalLanguages,
    year,
    authorOrArtist,
    group,
  });
  if (searchByIdsValue) {
    url.setQueryItem("ids[]", searchByIdsValue);
  } else if (searchTitleValue) {
    url.setQueryItem("title", searchTitleValue);
  }
  if (!isExactIdLookup) {
    if (includedTagsMode) url.setQueryItem("includedTagsMode", includedTagsMode);
    if (excludedTagsMode) url.setQueryItem("excludedTagsMode", excludedTagsMode);
    url.setQueryItem("includedTags[]", includedTags);
    url.setQueryItem("excludedTags[]", excludedTags);
  }

  const json = await fetchJSON<SearchResponse>({ url: url.toString(), method: "GET" });

  if (!Array.isArray(json.data)) {
    return { items: [], metadata: undefined };
  }

  const sortById = sortingOption?.id ?? "";
  const localRelevanceSort =
    !!searchTitleValue && (!sortById || sortById === "order[relevance]-desc");
  const items = await enrichAndParseMangaResults(
    json.data,
    ratings,
    languages,
    localRelevanceSort ? searchTitleValue : undefined,
  );

  return {
    items,
    metadata: computeNextMetadata(offset, json.data.length, json.total, MANGA_PAGE_LIMIT),
  };
}

export async function getSortingOptions(
  _query: SearchQuery<MangaDexSearchMetadata>,
): Promise<SortingOption[]> {
  return [
    { id: "order[latestUploadedChapter]-desc", label: "Latest Upload" },
    { id: "order[relevance]-desc", label: "Best Match" },
    { id: "order[latestUploadedChapter]-asc", label: "Oldest Upload" },
    { id: "order[title]-asc", label: "Title Ascending" },
    { id: "order[title]-desc", label: "Title Descending" },
    { id: "order[rating]-desc", label: "Highest Rating" },
    { id: "order[rating]-asc", label: "Lowest Rating" },
    { id: "order[followedCount]-desc", label: "Most Follows" },
    { id: "order[followedCount]-asc", label: "Least Follows" },
    { id: "order[createdAt]-desc", label: "Recently Added" },
    { id: "order[createdAt]-asc", label: "Oldest Added" },
    { id: "order[year]-asc", label: "Year Ascending" },
    { id: "order[year]-desc", label: "Year Descending" },
  ];
}
