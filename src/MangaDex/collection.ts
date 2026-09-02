/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { ManagedCollection, ManagedCollectionChangeset, SourceManga } from "@paperback/types";

import { resolveMangaId } from "./legacy";
import { getRatingEnumList } from "./lookups";
import type { MangaDetailsResponse, MangaStatusResponse, SearchResponse } from "./models";
import { fetchJSON } from "./network";
import { parseMangaDetails, readMangaDetailsSettings } from "./parsers";
import { getAccessToken } from "./state";
import { buildMangaListUrl, buildMangaStatusListUrl, buildMangaStatusWriteUrl } from "./urls";
import { MANGA_PAGE_LIMIT, chunk } from "./utils";

/**
 * MangaDex custom lists surfaced as Paperback managed collections, so a title
 * added on either side stays in step.
 */
export async function getManagedLibraryCollections(): Promise<ManagedCollection[]> {
  return [
    { id: "reading", title: "Reading" },
    { id: "on_hold", title: "On Hold" },
    { id: "plan_to_read", title: "Planned" },
    { id: "dropped", title: "Dropped" },
    { id: "re_reading", title: "Re-reading" },
    { id: "completed", title: "Completed" },
  ];
}

export async function commitManagedCollectionChanges(
  changeset: ManagedCollectionChangeset,
): Promise<void> {
  if (!getAccessToken()) {
    throw new Error("You need to be logged in");
  }

  const postStatus = async (mangaId: string, status: string | null, action: string) => {
    const resolvedId = await resolveMangaId(mangaId);
    try {
      await fetchJSON<{ result?: string }>({
        url: buildMangaStatusWriteUrl(resolvedId).toString(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`MangaDex collection ${action} failed for ${resolvedId}: ${detail}`);
    }
  };

  const additionRequests = (changeset.additions ?? []).map((a) =>
    postStatus(a.mangaId, changeset.collection.id, "add"),
  );
  const deletionRequests = (changeset.deletions ?? []).map((d) =>
    postStatus(d.mangaId, null, "remove"),
  );
  await Promise.all([...additionRequests, ...deletionRequests]);
}

export async function getSourceMangaInManagedCollection(
  managedCollection: ManagedCollection,
): Promise<SourceManga[]> {
  if (!getAccessToken()) {
    throw new Error("You need to be logged in");
  }

  const statusjson = await fetchJSON<MangaStatusResponse>({
    url: buildMangaStatusListUrl().toString(),
    method: "GET",
  });

  if (
    !statusjson.statuses ||
    typeof statusjson.statuses !== "object" ||
    Array.isArray(statusjson.statuses)
  ) {
    throw new Error("MangaDex returned no status data");
  }

  const ids = Object.keys(statusjson.statuses).filter(
    (x) => statusjson.statuses[x] === managedCollection.id,
  );

  const responses = await Promise.all(
    chunk(ids, MANGA_PAGE_LIMIT).map((batch) =>
      fetchJSON<SearchResponse>({
        url: buildMangaListUrl({
          limit: MANGA_PAGE_LIMIT,
          ratings: getRatingEnumList(),
          includes: ["author", "artist", "cover_art"],
          ids: batch,
        }).toString(),
        method: "GET",
      }),
    ),
  );

  const detailsSettings = readMangaDetailsSettings();

  return responses.flatMap((json) => {
    if (!Array.isArray(json.data)) return [];
    return json.data.map((item) =>
      parseMangaDetails(
        item.id,
        { result: "ok", response: "entity", data: item } as MangaDetailsResponse,
        undefined,
        detailsSettings,
      ),
    );
  });
}
