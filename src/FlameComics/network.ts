/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { URL } from "@paperback/types";

import { fetchText } from "../utils/network";
import { CDN, DOMAIN } from "./models";

/**
 * Access to the `_next/data` routes, whose paths embed a build id that changes
 * whenever the site redeploys.
 *
 * The routes signal failure in the response body rather than by status, so every
 * fetch here has to inspect what it parsed: a rotated build id and a deleted
 * series both arrive as HTTP 404 carrying valid JSON, and only the first is
 * worth retrying.
 */

/** The id only changes on redeploy, so a stale cache costs at most one retry. */
const BUILD_ID_TTL = 6 * 60 * 60;

let buildId: string | undefined;
let buildIdFetchedAt = 0;

/** The one failure a retry can fix. Everything else answers the same under a new id. */
class StaleBuildIdError extends Error {}

/**
 * The wrapper every `_next/data` response arrives in, including its failures:
 *
 *     stale build id  ->  `{"__N_SSG":true,"pageProps":{}}`   retry under a new id
 *     missing series  ->  `{"notFound":true}`                 no id will help
 *
 * Both parse cleanly, so without inspecting them a stale id yields silently
 * empty sections and a missing series throws deep inside a parser.
 */
interface NextDataEnvelope {
  pageProps?: Record<string, unknown>;
  notFound?: boolean;
}

async function fetchBuildId(): Promise<string> {
  const html = await fetchText(`${DOMAIN}/`);
  const buildId = /"buildId":"([^"]+)"/.exec(html)?.[1];

  if (!buildId) {
    throw new Error("FlameComics: no buildId found on the homepage; the site layout changed.");
  }

  return buildId;
}

async function getBuildId(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!buildId || now - buildIdFetchedAt > BUILD_ID_TTL) {
    buildId = await fetchBuildId();
    buildIdFetchedAt = now;
  }
  return buildId;
}

async function withBuildIdRetry<T>(fn: (buildId: string) => Promise<T>): Promise<T> {
  const id = await getBuildId();

  try {
    return await fn(id);
  } catch (error) {
    if (!(error instanceof StaleBuildIdError)) throw error;

    buildId = undefined;
    const fresh = await getBuildId();
    // Same id means the payload was not stale after all; retrying would repeat it.
    if (fresh === id) throw error;

    return fn(fresh);
  }
}

function dataUrl(id: string, segments: string[]): URL {
  const url = new URL(DOMAIN)
    .addPathComponent("_next")
    .addPathComponent("data")
    .addPathComponent(id);
  segments.forEach((s) => url.addPathComponent(s));
  return url;
}

export async function fetchNextData<T>(
  segments: string[],
  query?: Record<string, string>,
): Promise<T> {
  const path = segments.join("/");

  return withBuildIdRetry(async (id) => {
    const url = dataUrl(id, segments);
    if (query) for (const [k, v] of Object.entries(query)) url.setQueryItem(k, v);

    const body = await fetchText(url.toString());

    let payload: T & NextDataEnvelope;
    try {
      payload = JSON.parse(body) as T & NextDataEnvelope;
    } catch {
      // Not JSON at all: the data route did not match, which a rotated id explains.
      throw new StaleBuildIdError(`FlameComics: unparseable payload for ${path}`);
    }

    if (payload.notFound) {
      throw new Error(
        `FlameComics: ${path} does not exist on the site. ` +
          `If this title is in your library it predates a site renumbering — ` +
          `remove it from the library and re-add it from search.`,
      );
    }

    if (!payload.pageProps || Object.keys(payload.pageProps).length === 0) {
      throw new StaleBuildIdError(`FlameComics: empty payload for ${path}`);
    }

    return payload;
  });
}

/** `/api/series` is a plain REST route: no envelope, and immune to id rotation. */
export async function fetchSimpleSeries<T>(): Promise<T> {
  const url = new URL(DOMAIN).addPathComponent("api").addPathComponent("series");
  return JSON.parse(await fetchText(url.toString())) as T;
}

/** `last_edit` serves as the cache-buster; covers are replaced in place. */
export function buildSeriesCoverUrl(
  seriesId: number | string,
  cover: string,
  lastEdit: number | string,
): string {
  return `${CDN}/uploads/images/series/${seriesId}/${cover}?${lastEdit}`;
}

export function buildChapterImageUrl(
  seriesId: number | string,
  token: string,
  name: string,
): string {
  return `${CDN}/uploads/images/series/${seriesId}/${token}/${encodeURIComponent(name)}?${token}`;
}
