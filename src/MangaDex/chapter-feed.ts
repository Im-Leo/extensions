/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { ChapterRelationship, DatumAttributes, MangaDetailsResponse } from "./models";
import { fetchJSON } from "./network";
import { buildMangaByIdUrl } from "./urls";

/**
 * Reads of a manga that come from the chapter feed rather than a manga request.
 *
 * The feed inlines a partial manga on every chapter, which is enough to refresh
 * metadata without a second round trip — but it is typed as a loose
 * relationship, so it has to be validated before use.
 */

export async function fetchLatestUploadedChapter(mangaId: string): Promise<string | null> {
  const json = await fetchJSON<MangaDetailsResponse>({
    url: buildMangaByIdUrl(mangaId).toString(),
    method: "GET",
  });
  return json.data?.attributes?.latestUploadedChapter ?? null;
}

export type InlinedMangaAttributes = DatumAttributes & {
  tags?: unknown;
  latestUploadedChapter?: string;
};

export function readInlinedMangaItem(
  rel: ChapterRelationship | undefined,
): { id: string; attributes: InlinedMangaAttributes } | undefined {
  if (!rel || typeof rel.id !== "string" || !rel.attributes || typeof rel.attributes !== "object") {
    return undefined;
  }
  return { id: rel.id, attributes: rel.attributes as unknown as InlinedMangaAttributes };
}
