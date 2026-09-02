/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { Chapter, ChapterDetails, MangaInfo, SourceManga } from "@paperback/types";

import { fetchLatestUploadedChapter, readInlinedMangaItem } from "./chapter-feed";
import {
  assignChapterNumber,
  buildChapterIdentifier,
  extractScanlationGroupNames,
  normalizePagesCount,
} from "./chapter-parsers";
import { isGroupNameBlocked, isRatingAllowed } from "./chapter-utils";
import { MDLanguages } from "./languages";
import { resolveChapterId, resolveMangaId } from "./legacy";
import { getMangaDetails } from "./manga";
import type { ChapterDetailsResponse, ChapterRelationship, ChapterResponse } from "./models";
import { fetchJSON } from "./network";
import {
  assertDataArray,
  parseMangaItemDetails,
  readMangaTitleSettings,
  reconcileStoredCompletedStatus,
  type MangaDetailsSettings,
} from "./parsers";
import { findMangaRelationship } from "./relationships";
import {
  getBlockedGroups,
  getBlockedUploaders,
  getDataSaver,
  getForcePort443,
  getFuzzyBlockingEnabled,
  getGroupBlockingEnabled,
  getIncludeUnavailable,
  getLanguages,
  getMetadataUpdater,
  getOptimizeUpdates,
  getRatings,
  getSkipSameChapter,
} from "./state";
import { buildAtHomeServerUrl, buildMangaFeedUrl } from "./urls";
import {
  FEED_PAGE_LIMIT,
  MAX_API_OFFSET,
  decodeHTML,
  formatPublishAtSince,
  parseDateOrUndefined,
  precomputeQuery,
} from "./utils";

export async function getChapters(
  sourceManga: SourceManga,
  sinceDate?: Date,
  skipMetadataUpdate: boolean = false,
): Promise<Chapter[]> {
  const mangaId = await resolveMangaId(sourceManga.mangaId);
  if (sourceManga.mangaId !== mangaId) {
    sourceManga.mangaId = mangaId;
  }

  if (!sourceManga.mangaInfo) {
    sourceManga.mangaInfo = {} as MangaInfo;
  }
  if (!sourceManga.mangaInfo.additionalInfo) {
    sourceManga.mangaInfo.additionalInfo = {};
  }

  const metadataUpdaterEnabled = !skipMetadataUpdate && getMetadataUpdater();
  const needsFullRefresh =
    metadataUpdaterEnabled ||
    !sourceManga.mangaInfo.status ||
    !sourceManga.mangaInfo.contentRating ||
    !sourceManga.mangaInfo.shareUrl;
  let mangaDetailsFreshlyFetched = false;
  if (needsFullRefresh) {
    const previousAdditionalInfo = sourceManga.mangaInfo?.additionalInfo;
    const updatedManga = await getMangaDetails(mangaId);
    sourceManga.mangaInfo = updatedManga.mangaInfo;
    const mergedAdditionalInfo: Record<string, string> = {
      ...previousAdditionalInfo,
      ...updatedManga.mangaInfo.additionalInfo,
    };
    if (
      updatedManga.mangaInfo.additionalInfo &&
      !("latestUploadedChapter" in updatedManga.mangaInfo.additionalInfo)
    ) {
      delete mergedAdditionalInfo["latestUploadedChapter"];
    }
    sourceManga.mangaInfo.additionalInfo = mergedAdditionalInfo;
    mangaDetailsFreshlyFetched = true;
  }

  const languages: string[] = getLanguages();
  const languageSet = new Set(languages);
  const skipSameChapter = getSkipSameChapter();
  const ratings: string[] = getRatings();

  // Deferred until mdContentRating can be refreshed from the inline manga
  // relationship: an entry saved before that field existed reports UNKNOWN, and
  // gating on it would reject a title the user has actually enabled.
  let ratingGateEvaluated = false;
  const evaluateRatingGate = (): void => {
    if (ratingGateEvaluated) return;
    ratingGateEvaluated = true;
    const storedMdRating = sourceManga.mangaInfo.additionalInfo?.["mdContentRating"] as
      | string
      | undefined;
    const mangaPbRating = sourceManga.mangaInfo.contentRating;
    if (!isRatingAllowed(storedMdRating, mangaPbRating, ratings)) {
      const ratingForMessage = storedMdRating ?? mangaPbRating;
      throw new Error(
        `Content rating (${ratingForMessage}) not enabled in source settings (if it shows UNKNOWN, open the manga again).`,
      );
    }
  };
  const optimizeUpdates = getOptimizeUpdates();
  const willRefreshInlineMetadata = !needsFullRefresh && optimizeUpdates;
  if (!willRefreshInlineMetadata) {
    evaluateRatingGate();
  }

  const groupBlockingEnabled = getGroupBlockingEnabled();
  const fuzzyBlockingEnabled = getFuzzyBlockingEnabled();
  const blockedGroupsData = groupBlockingEnabled ? (getBlockedGroups() ?? {}) : {};
  const blockedGroups = Object.keys(blockedGroupsData);
  const blockedUploaders = getBlockedUploaders();
  const includeUnavailable = getIncludeUnavailable();
  const blockedGroupQueries =
    groupBlockingEnabled && fuzzyBlockingEnabled
      ? blockedGroups
          .map((id) => blockedGroupsData[id]?.attributes?.name)
          .filter((name): name is string => !!name)
          .map((name) => precomputeQuery(name))
      : [];
  // Group names repeat across a 500-chapter feed, and matching them is fuzzy.
  const groupBlockCache = new Map<string, boolean>();
  const collectedChapters: Set<string> | null = skipSameChapter ? new Set<string>() : null;
  const chapters: Chapter[] = [];

  let offset = 0;
  let hasResults = true;
  let prevChapNum = 0;
  let unnumberedIndex = 0;
  let anyMissingVolume = false;

  let verifiedLatestChapterId: string | null = null;
  let resetChapterNumbersOnVolume = false;
  const baseIncludes = ["scanlation_group"];
  const needsInlineManga = optimizeUpdates || skipSameChapter;
  const firstPageIncludes = needsInlineManga ? [...baseIncludes, "manga"] : baseIncludes;

  const inlineMetadataSettings: MangaDetailsSettings | undefined = willRefreshInlineMetadata
    ? readMangaTitleSettings()
    : undefined;

  const publishAtSince = formatPublishAtSince(sinceDate);

  while (hasResults) {
    const includes = offset === 0 ? firstPageIncludes : baseIncludes;
    const request = {
      url: buildMangaFeedUrl({
        mangaId,
        offset,
        includes,
        blockedGroups,
        blockedUploaders,
        ratings,
        languages,
        publishAtSince,
        includeUnavailable,
      }).toString(),
      method: "GET",
    };

    const json = await fetchJSON<ChapterResponse>(request);

    offset += FEED_PAGE_LIMIT;

    assertDataArray(json, mangaId);

    if (needsInlineManga && offset === FEED_PAGE_LIMIT) {
      const mangaItem = readInlinedMangaItem(
        findMangaRelationship<ChapterRelationship>(
          json.data.flatMap((c) => c?.relationships ?? []),
        ),
      );
      const idMatches = mangaItem?.id?.toLowerCase() === mangaId;
      const mangaAttrs = mangaItem?.attributes;
      if (idMatches && mangaAttrs) {
        resetChapterNumbersOnVolume = mangaAttrs.chapterNumbersResetOnNewVolume === true;
      }
      if (optimizeUpdates && idMatches && mangaAttrs?.latestUploadedChapter) {
        verifiedLatestChapterId = mangaAttrs.latestUploadedChapter;
      }
      if (willRefreshInlineMetadata && idMatches && mangaAttrs && Array.isArray(mangaAttrs.tags)) {
        const mangaItemDetails = parseMangaItemDetails(mangaId, mangaAttrs, inlineMetadataSettings);
        sourceManga.mangaInfo.primaryTitle = mangaItemDetails.primaryTitle;
        sourceManga.mangaInfo.secondaryTitles = mangaItemDetails.secondaryTitles;
        sourceManga.mangaInfo.synopsis = mangaItemDetails.synopsis;
        sourceManga.mangaInfo.status = reconcileStoredCompletedStatus(
          mangaAttrs.status,
          sourceManga.mangaInfo.status,
        );
        sourceManga.mangaInfo.tagGroups = mangaItemDetails.tagGroups;
        sourceManga.mangaInfo.contentRating = mangaItemDetails.contentRating;
        sourceManga.mangaInfo.shareUrl = mangaItemDetails.shareUrl;
        sourceManga.mangaInfo.additionalInfo = {
          ...sourceManga.mangaInfo.additionalInfo,
          mdContentRating: mangaItemDetails.mdContentRating,
        };
      }
      evaluateRatingGate();
    }

    for (const chapter of json.data) {
      if (!chapter || !chapter.attributes) continue;
      const chapterId = chapter.id;
      const chapterDetails = chapter.attributes;
      const time = parseDateOrUndefined(chapterDetails.publishAt);

      if (!languageSet.has(chapterDetails.translatedLanguage)) {
        continue;
      }

      const rawTitle = decodeHTML(chapterDetails.title ?? "");
      const isPureOneshot = !chapterDetails.volume && !chapterDetails.chapter && !rawTitle;
      const name = isPureOneshot ? "Oneshot" : rawTitle;
      const { chapNum, isUnnumbered } = assignChapterNumber(chapterDetails.chapter, prevChapNum);
      if (isUnnumbered && skipSameChapter) {
        unnumberedIndex++;
      }
      prevChapNum = chapNum;

      const volume = Number(chapterDetails.volume) || 0;
      const langCode = MDLanguages.getFlagCode(chapterDetails.translatedLanguage);
      const groupNames = extractScanlationGroupNames(chapter);
      const group = groupNames.join(", ");
      const pages = normalizePagesCount(chapterDetails.pages);
      let identifier: string | undefined;
      if (skipSameChapter) {
        identifier = buildChapterIdentifier(
          chapNum,
          isUnnumbered,
          name,
          chapterDetails.translatedLanguage ?? "",
          unnumberedIndex,
          volume,
          resetChapterNumbersOnVolume,
        );
        if (collectedChapters!.has(identifier)) continue;
      }

      if (
        groupNames.length > 0 &&
        blockedGroupQueries.length > 0 &&
        groupNames.some((n) => isGroupNameBlocked(n, blockedGroupQueries, groupBlockCache))
      ) {
        continue;
      }

      const externalUrl = chapterDetails.externalUrl;
      const isUnavailable = pages === 0 || !!externalUrl || chapterDetails.isUnavailable === true;
      const shouldInclude = !isUnavailable || includeUnavailable;
      if (shouldInclude) {
        if (!chapterDetails.volume) anyMissingVolume = true;
        const titleForChapter = isUnavailable ? `[Unavailable] ${name}` : name;
        chapters.push({
          chapterId,
          sourceManga,
          title: titleForChapter,
          chapNum,
          volume,
          langCode,
          version: group,
          publishDate: time,
          sortingIndex: 0,
        });
        if (identifier !== undefined) collectedChapters!.add(identifier);
      }
    }

    if (
      json.data.length < FEED_PAGE_LIMIT ||
      typeof json.total !== "number" ||
      json.total <= offset ||
      offset >= MAX_API_OFFSET
    ) {
      hasResults = false;
    }
  }

  let nextLatestChapter: string | null | undefined = verifiedLatestChapterId ?? undefined;
  if (nextLatestChapter === undefined && optimizeUpdates) {
    if (mangaDetailsFreshlyFetched) {
      nextLatestChapter = sourceManga.mangaInfo.additionalInfo?.["latestUploadedChapter"] ?? null;
    } else {
      try {
        nextLatestChapter = await fetchLatestUploadedChapter(mangaId);
      } catch {}
    }
  }
  if (typeof nextLatestChapter === "string") {
    sourceManga.mangaInfo.additionalInfo = {
      ...sourceManga.mangaInfo.additionalInfo,
      latestUploadedChapter: nextLatestChapter,
    };
  } else if (
    nextLatestChapter === null &&
    sourceManga.mangaInfo.additionalInfo &&
    "latestUploadedChapter" in sourceManga.mangaInfo.additionalInfo
  ) {
    const next = { ...sourceManga.mangaInfo.additionalInfo };
    delete next["latestUploadedChapter"];
    sourceManga.mangaInfo.additionalInfo = next;
  }

  const filteredChapters =
    sinceDate instanceof Date
      ? chapters.filter((chapter) => !chapter.publishDate || chapter.publishDate >= sinceDate)
      : chapters;
  if (anyMissingVolume) {
    for (const chapter of filteredChapters) {
      chapter.volume = 0;
    }
  }
  filteredChapters.forEach((chapter, index) => {
    chapter.sortingIndex = filteredChapters.length - index;
  });
  return filteredChapters;
}

export async function getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
  const [chapterId, mangaId] = await Promise.all([
    resolveChapterId(chapter.chapterId),
    resolveMangaId(chapter.sourceManga.mangaId),
  ]);
  if (chapter.chapterId !== chapterId) chapter.chapterId = chapterId;
  if (chapter.sourceManga.mangaId !== mangaId) chapter.sourceManga.mangaId = mangaId;

  const dataSaver = getDataSaver();
  const forcePort = getForcePort443();

  const request = {
    url: buildAtHomeServerUrl(chapterId, forcePort),
    method: "GET",
  };

  const json = await fetchJSON<ChapterDetailsResponse>(request);
  if (!json.baseUrl || !json.chapter || !json.chapter.hash) {
    throw new Error(`MangaDex returned malformed chapter response for ${chapterId}`);
  }
  const serverUrl = json.baseUrl;
  const chapterDetails = json.chapter;
  const useDataSaver =
    dataSaver && Array.isArray(chapterDetails.dataSaver) && chapterDetails.dataSaver.length > 0;
  const sourceArray = useDataSaver ? chapterDetails.dataSaver : chapterDetails.data;
  if (!Array.isArray(sourceArray) || sourceArray.length === 0) {
    throw new Error(`MangaDex returned no pages for chapter ${chapterId}`);
  }

  const qualityPath = useDataSaver ? "data-saver" : "data";
  const pages = sourceArray.map(
    (x: string) => `${serverUrl}/${qualityPath}/${chapterDetails.hash}/${x}`,
  );

  return { id: chapterId, mangaId: mangaId, pages };
}
