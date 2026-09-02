/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { SourceManga, UpdateManager } from "@paperback/types";

import { fetchLatestUploadedChapter } from "./chapter-feed";
import { resolveMangaIds } from "./legacy";
import type { SearchResponse } from "./models";
import { fetchJSON } from "./network";
import { reconcileStoredCompletedStatus } from "./parsers";
import {
  getLanguages,
  getOptimizeUpdates,
  getRatings,
  getSkipNewChapters,
  getSkipPublicationStatus,
  getSkipUnreadChapters,
  getUpdateBatchSize,
} from "./state";
import { buildMangaListUrl } from "./urls";
import { isNotFoundError, shouldSkipByCount } from "./utils";

/**
 * The library-update flow.
 *
 * Paperback asks for every followed title at once, so this batches the requests
 * and skips titles whose stored high-water chapter has not moved — the check
 * that keeps a routine update from costing one request per title.
 */

export async function processTitlesForUpdates(
  updateManager: UpdateManager,
  _lastUpdateDate?: Date,
): Promise<void> {
  const sourceManga = updateManager.getQueuedItems();

  const idMap = await resolveMangaIds(sourceManga.map((m) => m.mangaId));

  const mangaMap = new Map<string, SourceManga>();
  const mangaIds: string[] = [];
  const skipped: string[] = [];
  for (const manga of sourceManga) {
    const resolved = idMap[manga.mangaId];
    if (!resolved) {
      skipped.push(manga.mangaId);
      continue;
    }
    if (manga.mangaId !== resolved) manga.mangaId = resolved;
    mangaIds.push(manga.mangaId);
    mangaMap.set(manga.mangaId, manga);
  }
  if (skipped.length > 0) {
    await Promise.all(skipped.map((mangaId) => updateManager.setNewChapters(mangaId, [])));
  }

  const optimizeUpdates = getOptimizeUpdates();

  if (optimizeUpdates) {
    const ratings: string[] = getRatings();
    const languages: string[] = getLanguages();
    const skipPublicationStatus = getSkipPublicationStatus();
    const batchSize = getUpdateBatchSize();
    const skipNewChapters = getSkipNewChapters();
    const skipUnreadChapters = getSkipUnreadChapters();

    for (let i = 0; i < mangaIds.length; i += batchSize) {
      const batchIds = mangaIds.slice(i, i + batchSize);
      const idsToSkip: string[] = [];

      const request = {
        url: buildMangaListUrl({
          limit: batchSize,
          languages,
          ratings,
          ids: batchIds,
          includes: [],
        }).toString(),
        method: "GET",
      };

      let json: SearchResponse;
      try {
        json = await fetchJSON<SearchResponse>(request);
      } catch {
        continue;
      }

      const seenIds = new Set<string>();
      if (Array.isArray(json.data)) {
        for (const mangaData of json.data) {
          if (!mangaData || !mangaData.attributes) continue;
          const apiId = mangaData.id.toLowerCase();
          seenIds.add(apiId);
          const storedManga = mangaMap.get(apiId);
          if (!storedManga) continue;

          const latestApiChapter = mangaData.attributes.latestUploadedChapter;
          const latestStoredChapter =
            storedManga.mangaInfo?.additionalInfo?.["latestUploadedChapter"];
          const chapterChanged = (latestApiChapter ?? null) !== (latestStoredChapter ?? null);

          const skipUnread = shouldSkipByCount(
            skipUnreadChapters,
            storedManga.unreadChapterCount,
            storedManga.chapterCount,
          );
          const skipNew = shouldSkipByCount(
            skipNewChapters,
            storedManga.newChapterCount,
            storedManga.chapterCount,
          );
          const effectiveStatus = reconcileStoredCompletedStatus(
            mangaData.attributes.status,
            storedManga.mangaInfo?.status,
          );
          const filterSkip =
            skipPublicationStatus.includes(effectiveStatus) || skipUnread || skipNew;

          if (!chapterChanged || filterSkip) {
            idsToSkip.push(apiId);
          }
        }
      }

      const missingIds = batchIds.filter((id) => !seenIds.has(id));
      const VERIFY_MISSING_THRESHOLD = 10;
      if (missingIds.length > 0 && missingIds.length <= VERIFY_MISSING_THRESHOLD) {
        const verifyResults = await Promise.allSettled(
          missingIds.map((mangaId) => fetchLatestUploadedChapter(mangaId)),
        );
        for (const [k, result] of verifyResults.entries()) {
          const mangaId = missingIds[k];
          if (!mangaId) continue;

          if (result.status === "fulfilled") {
            const stored = mangaMap.get(mangaId);
            const latestStored =
              stored?.mangaInfo?.additionalInfo?.["latestUploadedChapter"] ?? null;
            if (result.value === null || result.value === latestStored) {
              idsToSkip.push(mangaId);
            }
            continue;
          }

          if (isNotFoundError(result.reason)) {
            idsToSkip.push(mangaId);
          }
        }
      } else if (missingIds.length > VERIFY_MISSING_THRESHOLD) {
        idsToSkip.push(...missingIds);
      }

      await Promise.all(idsToSkip.map((mangaId) => updateManager.setNewChapters(mangaId, [])));
    }
  }
}
