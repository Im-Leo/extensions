/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { TagSection } from "@paperback/types";

import { RATINGS } from "./lookups";
import { fetchJSON } from "./network";
import { buildTagListUrl } from "./urls";

/** Tags change rarely; a month-old cache is still serviceable. */
const TAG_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type TagGroup = string;
export interface Tag {
  id: string;
  group: TagGroup;
  name: { en: string; [locale: string]: string };
}

export interface TagCache {
  tags: Tag[];
  fetchedAt: number;
}

interface RawTagListResponse {
  data: Array<{
    id: string;
    attributes: {
      group: TagGroup;
      name: { en: string; [locale: string]: string };
    };
  }>;
}

/**
 * Content ratings are a query parameter, not real tags, but the search UI has
 * only tag sections to render them in — so they are synthesised here.
 */
const SYNTHETIC_RATING_TAGS: Tag[] = RATINGS.map((r, i) => ({
  id: String(i + 1),
  group: "content_rating",
  name: { en: r.shortName },
}));

export const CONTENT_RATING_GROUP = "content_rating";

/** Synthetic tag id to API enum value, not the display label. */
export const SYNTHETIC_RATING_ID_TO_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  RATINGS.map((r, i) => [String(i + 1), r.enum]),
);

/** Fewer than this means a truncated response, not a shrunken vocabulary. */
const MIN_FETCHED_TAG_ENTRIES = 40;

let inFlightFetch: Promise<TagCache> | null = null;

/** Separate from {@link inFlightFetch}: a cold start has no cache to fall back on. */
let inFlightColdStart: Promise<TagCache> | null = null;

const SYNTH_BACKOFF_START_MS = 60 * 1000;
const SYNTH_BACKOFF_MAX_MS = 60 * 60 * 1000;
/** Backoff for the synthetic-only fallback, so a hard outage is not hammered. */
let synthRetryAt = 0;
let synthBackoffMs = SYNTH_BACKOFF_START_MS;

export function getCachedTags(): TagCache | null {
  const raw = Application.getState("mangadex_tag_cache") as unknown;
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !Array.isArray((raw as TagCache).tags) ||
    typeof (raw as TagCache).fetchedAt !== "number"
  ) {
    return null;
  }
  const cache = raw as TagCache;
  if (cache.tags.length === 0) {
    return null;
  }
  for (const tag of cache.tags as unknown[]) {
    const typedTag = tag as { id?: unknown; group?: unknown; name?: { en?: unknown } };
    if (
      !typedTag ||
      typeof typedTag !== "object" ||
      typeof typedTag.id !== "string" ||
      typedTag.id === "" ||
      typeof typedTag.group !== "string" ||
      typedTag.group === "" ||
      !typedTag.name ||
      typeof typedTag.name !== "object" ||
      typeof (typedTag.name as { en?: unknown }).en !== "string" ||
      (typedTag.name as { en?: string }).en === ""
    ) {
      return null;
    }
  }
  return cache;
}

export function setCachedTags(cache: TagCache): void {
  Application.setState(cache, "mangadex_tag_cache");
}

export function resetTagCache(): void {
  Application.setState(undefined, "mangadex_tag_cache");
  synthRetryAt = 0;
  synthBackoffMs = SYNTH_BACKOFF_START_MS;
}

export async function fetchTags(): Promise<TagCache> {
  const response = await fetchJSON<RawTagListResponse>({
    url: buildTagListUrl(),
    method: "GET",
  });
  const apiTags: Tag[] = response.data.map((entry) => ({
    id: entry.id,
    group: entry.attributes.group,
    name: entry.attributes.name,
  }));
  const cache: TagCache = {
    tags: [...SYNTHETIC_RATING_TAGS, ...apiTags],
    fetchedAt: Date.now(),
  };
  if (cache.tags.length < MIN_FETCHED_TAG_ENTRIES) {
    throw new Error(
      `MangaDex /manga/tag returned only ${apiTags.length} tags (need >= ${MIN_FETCHED_TAG_ENTRIES - SYNTHETIC_RATING_TAGS.length})`,
    );
  }
  setCachedTags(cache);
  return cache;
}

function startFetch(): Promise<TagCache> {
  if (inFlightFetch !== null) return inFlightFetch;
  const promise = fetchTags();
  inFlightFetch = promise;
  promise
    .finally(() => {
      if (inFlightFetch === promise) inFlightFetch = null;
    })
    .catch(() => {});
  return promise;
}

export async function ensureTags(): Promise<TagCache> {
  const cache = getCachedTags();
  if (!cache) {
    if (inFlightColdStart === null) {
      inFlightColdStart = startFetch()
        .catch((err): TagCache => {
          console.log(`[MangaDex] Tag fetch failed, using synthetic fallback: ${String(err)}`);
          const fallback: TagCache = { tags: [...SYNTHETIC_RATING_TAGS], fetchedAt: 0 };
          setCachedTags(fallback);
          synthRetryAt = Date.now() + synthBackoffMs;
          return fallback;
        })
        .finally(() => {
          inFlightColdStart = null;
        });
    }
    return inFlightColdStart;
  }
  if (cache.fetchedAt === 0) {
    if (Date.now() >= synthRetryAt) {
      synthRetryAt = Date.now() + synthBackoffMs;
      synthBackoffMs = Math.min(synthBackoffMs * 2, SYNTH_BACKOFF_MAX_MS);
      startFetch().then(
        () => {
          synthBackoffMs = SYNTH_BACKOFF_START_MS;
          synthRetryAt = 0;
        },
        (err: unknown) => {
          console.log(`[MangaDex] Synthetic fallback tag refresh failed: ${String(err)}`);
        },
      );
    }
    return cache;
  }
  if (Date.now() - cache.fetchedAt >= TAG_CACHE_MAX_AGE_MS) {
    startFetch().catch((err) => {
      console.log(`[MangaDex] Background tag refresh failed, keeping stale cache: ${String(err)}`);
    });
  }
  return cache;
}

export function forceRefreshTags(): Promise<TagCache> {
  return startFetch();
}

export const formatTagGroupName = (group: string): string =>
  group.charAt(0).toUpperCase() + group.slice(1).replace(/_/g, " ");

export async function getSearchTagSections(enabledRatings?: string[]): Promise<TagSection[]> {
  const cache = await ensureTags();
  const sections = new Map<string, TagSection>();
  for (const tag of cache.tags) {
    let section = sections.get(tag.group);
    if (!section) {
      section = { id: tag.group, title: formatTagGroupName(tag.group), tags: [] };
      sections.set(tag.group, section);
    }
    const blocked =
      tag.group === "content_rating" &&
      enabledRatings !== undefined &&
      !enabledRatings.includes(SYNTHETIC_RATING_ID_TO_NAME[tag.id] ?? "");
    section.tags?.push({
      id: tag.id,
      title: blocked ? `${tag.name.en} (Blocked in settings)` : tag.name.en,
    });
  }
  for (const section of sections.values()) {
    if (section.id === CONTENT_RATING_GROUP) continue;
    section.tags?.sort((a, b) => a.title.localeCompare(b.title));
  }
  return Array.from(sections.values()).sort((a, b) => a.title.localeCompare(b.title));
}
