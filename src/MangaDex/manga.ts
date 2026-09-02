/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { SourceManga } from "@paperback/types";

import { resolveMangaId } from "./legacy";
import type {
  AggregateResponse,
  CoverSearchResponse,
  MangaDetailsResponse,
  StatisticsResponse,
} from "./models";
import { Status } from "./models";
import { fetchJSON } from "./network";
import { parseMangaDetails, readMangaDetailsSettings } from "./parsers";
import { getLanguages, getTryFirstVolumeCover } from "./state";
import {
  buildCoverSearchUrl,
  buildMangaAggregateUrl,
  buildMangaByIdUrl,
  buildStatisticsForMangaUrl,
} from "./urls";
import { isNotFoundError } from "./utils";

export async function getMangaDetails(mangaId: string): Promise<SourceManga> {
  const resolvedId = await resolveMangaId(mangaId);

  const detailsRequest = {
    url: buildMangaByIdUrl(resolvedId, ["author", "artist", "cover_art"]).toString(),
    method: "GET",
  };

  const statisticsRequest = {
    url: buildStatisticsForMangaUrl(resolvedId).toString(),
    method: "GET",
  };

  const tryFirstVolumeCover = getTryFirstVolumeCover();
  // A batch, because covers with a null volume sort first; the pick happens below.
  const coverRequest = tryFirstVolumeCover
    ? {
        url: buildCoverSearchUrl({ mangaId: resolvedId, limit: 10, orderVolume: "asc" }).toString(),
        method: "GET",
      }
    : undefined;

  // Joins the parallel batch speculatively: whether it is needed depends on a
  // status not known until the batch resolves.
  const aggregateRequest = {
    url: buildMangaAggregateUrl(resolvedId, getLanguages()).toString(),
    method: "GET",
  };

  const [detailsResult, statsResult, coverResult, aggregateResult] = await Promise.allSettled([
    fetchJSON<MangaDetailsResponse>(detailsRequest),
    fetchJSON<StatisticsResponse>(statisticsRequest),
    coverRequest
      ? fetchJSON<CoverSearchResponse>(coverRequest)
      : Promise.resolve(undefined as CoverSearchResponse | undefined),
    fetchJSON<AggregateResponse>(aggregateRequest),
  ]);

  if (detailsResult.status === "rejected") {
    const reason = detailsResult.reason;
    if (isNotFoundError(reason)) {
      const msg = reason instanceof Error ? reason.message : String(reason);
      throw new Error(`${msg}. You may need to add this manga again`);
    }
    throw reason instanceof Error ? reason : new Error(String(reason));
  }

  const json = detailsResult.value;
  if (!json.data) {
    throw new Error(`MangaDex API Error: missing data field for ${resolvedId}`);
  }

  const aggregateJson: AggregateResponse | undefined =
    json.data.attributes?.status === Status.Completed && aggregateResult.status === "fulfilled"
      ? aggregateResult.value
      : undefined;

  const ratingJson: StatisticsResponse | undefined =
    statsResult.status === "fulfilled" ? statsResult.value : undefined;

  const coverJson: CoverSearchResponse | undefined =
    coverResult.status === "fulfilled" ? coverResult.value : undefined;
  const coverFileNameOverride = coverJson?.data?.find(
    (c) =>
      c?.attributes?.volume !== null &&
      c?.attributes?.volume !== undefined &&
      c?.attributes?.volume !== "",
  )?.attributes?.fileName;

  return parseMangaDetails(
    resolvedId,
    json,
    ratingJson,
    readMangaDetailsSettings(),
    aggregateJson,
    coverFileNameOverride,
  );
}
