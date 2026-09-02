/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type {
  ChapterReadActionQueueProcessingResult,
  MangaProgress,
  Request,
  SourceManga,
  TrackedMangaChapterReadAction,
} from "@paperback/types";

import { URLBuilder } from "../utils/url-builder/base";
import { getAccessToken } from "./forms/settings";
import { AS_API_DOMAIN, type AsuraBookmarkResponse } from "./models";

async function authorizedRequest(url: string, method: "GET" | "POST"): Promise<Request> {
  return { url, method, headers: { Authorization: `Bearer ${await getAccessToken()}` } };
}

/** Bookmarks are searchable only by title, so the slug decides the real match. */
async function findBookmark(sourceManga: SourceManga) {
  const request = await authorizedRequest(
    new URLBuilder(AS_API_DOMAIN, "repeat")
      .addPath("api")
      .addPath("me")
      .addPath("bookmarks")
      .addQuery("search", sourceManga.mangaInfo.primaryTitle)
      .build(),
    "GET",
  );

  const [response, buffer] = await Application.scheduleRequest(request);
  if (response.status !== 200) throw new Error("Failed to fetch manga progress.");

  const bookmarks = JSON.parse(
    Application.arrayBufferToUTF8String(buffer),
  ) as AsuraBookmarkResponse;

  return bookmarks.data.find((bookmark) => bookmark.series.slug === sourceManga.mangaId);
}

export async function getMangaProgress(sourceManga: SourceManga): Promise<MangaProgress> {
  const bookmark = await findBookmark(sourceManga);
  if (!bookmark) throw new Error("Manga not found in bookmarks.");

  return {
    sourceManga,
    lastReadChapter: {
      chapterId: bookmark.last_read_chapter.toString(),
      sourceManga,
      volume: 0,
      langCode: "en",
      chapNum: bookmark.last_read_chapter,
    },
    lastReadTime: new Date(bookmark.last_read_at),
    userRating: 0,
  };
}

export async function processChapterReadActionQueue(
  actions: TrackedMangaChapterReadAction[],
): Promise<ChapterReadActionQueueProcessingResult> {
  const result: ChapterReadActionQueueProcessingResult = {
    successfulItems: [],
    failedItems: [],
  };

  if (!Application.getState("user")) return result;

  // The API stores one high-water mark per title, so only the furthest chapter
  // needs sending; earlier actions in the queue are acknowledged untouched.
  const furthest = new Map<string, number>();
  for (const action of actions) {
    const mangaId = action.sourceManga.mangaId;
    if ((furthest.get(mangaId) ?? 0) < action.chapterNum) furthest.set(mangaId, action.chapterNum);
  }

  for (const action of actions) {
    if (furthest.get(action.sourceManga.mangaId) !== action.chapterNum) {
      result.successfulItems.push(action.id);
      continue;
    }

    const seriesId = action.sourceManga.mangaInfo.additionalInfo?.["id"];
    if (!seriesId) {
      result.failedItems.push(action.id);
      continue;
    }

    try {
      const bookmark = await findBookmark(action.sourceManga);

      // Progress can only be recorded against a bookmark that already exists.
      if (!bookmark) {
        const [created] = await Application.scheduleRequest(
          await authorizedRequest(
            new URLBuilder(AS_API_DOMAIN, "repeat")
              .addPath("api")
              .addPath("bookmarks")
              .addPath(seriesId)
              .build(),
            "POST",
          ),
        );

        if (created.status !== 200) {
          result.failedItems.push(action.id);
          continue;
        }
      } else if ((bookmark.last_read_chapter ?? 0) >= action.chapterNum) {
        result.successfulItems.push(action.id);
        continue;
      }

      const [updated] = await Application.scheduleRequest(
        await authorizedRequest(
          new URLBuilder(AS_API_DOMAIN, "repeat")
            .addPath("api")
            .addPath("bookmarks")
            .addPath(seriesId)
            .addPath("read")
            .addPath(action.chapterNum.toString())
            .build(),
          "POST",
        ),
      );

      if (updated.status === 200) result.successfulItems.push(action.id);
      else result.failedItems.push(action.id);
    } catch {
      result.failedItems.push(action.id);
    }
  }

  return result;
}
