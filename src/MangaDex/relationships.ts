/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { getImageQualityEnding } from "./lookups";
import { COVER_BASE_URL } from "./models";
import type { ChapterData, Relationship } from "./models";

/**
 * Navigation of the `relationships` array every MangaDex entity carries.
 *
 * Entries are untyped by kind on the wire, so each lookup filters by `type`
 * first. Ids are lowercased because the API accepts either case but returns
 * only one, and callers key maps by them.
 */

export function buildCoverImageUrl(
  mangaId: string,
  fileName: string,
  thumbnailQuality: string,
): string {
  return `${COVER_BASE_URL}/${mangaId}/${fileName}${getImageQualityEnding(thumbnailQuality)}`;
}

/** Empty string when there is no cover_art relationship; Paperback shows its own. */
export function extractCoverImageUrl(
  relationships: Relationship[] | undefined,
  mangaId: string,
  thumbnailQuality: string,
): string {
  const coverFileName = relationships?.find((x): x is Relationship => x?.type === "cover_art")
    ?.attributes?.fileName;
  if (!coverFileName) return "";
  return buildCoverImageUrl(mangaId, coverFileName, thumbnailQuality);
}

export function findMangaRelationship<T extends { id?: string; type?: string }>(
  relationships: ReadonlyArray<T | undefined | null> | undefined,
): T | undefined {
  if (!Array.isArray(relationships)) return undefined;
  for (const rel of relationships) {
    if (rel && rel.type === "manga" && typeof rel.id === "string" && rel.id.length > 0) {
      return rel;
    }
  }
  return undefined;
}

export function findMangaRelationshipId(
  relationships: ReadonlyArray<{ id?: string; type?: string } | undefined | null> | undefined,
): string | undefined {
  return findMangaRelationship(relationships)?.id?.toLowerCase();
}

export function filterMangaRelationships<T extends { type?: string }>(
  relationships: ReadonlyArray<T | undefined | null> | undefined,
): T[] {
  if (!Array.isArray(relationships)) return [];
  return relationships.filter((r): r is T => !!r && r.type === "manga");
}

/**
 * One chapter per manga, keyed by lowercased id — the feed returns many chapters
 * per title and only the first is needed to identify it.
 */
export function collectUniqueMangaIdsFromChapters(
  chapters: ReadonlyArray<ChapterData | undefined | null> | undefined,
): { ids: string[]; chapterByMangaId: Map<string, ChapterData> } {
  const chapterByMangaId = new Map<string, ChapterData>();
  const ids: string[] = [];
  if (!Array.isArray(chapters)) return { ids, chapterByMangaId };
  for (const chapter of chapters) {
    if (!chapter) continue;
    const mangaId = findMangaRelationshipId(chapter.relationships);
    if (!mangaId || chapterByMangaId.has(mangaId)) continue;
    chapterByMangaId.set(mangaId, chapter);
    ids.push(mangaId);
  }
  return { ids, chapterByMangaId };
}
