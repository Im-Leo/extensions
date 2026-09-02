/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { fetchJSON } from "./network";
import { buildLegacyMappingUrl } from "./urls";
import { chunk } from "./utils";

interface LegacyMappingItem {
  id: string;
  type: string;
  attributes: {
    type: string;
    legacyId: number;
    newId: string;
  };
}

interface LegacyMappingResponse {
  result: string;
  data: LegacyMappingItem[];
}

/**
 * Resolution of MangaDex's pre-v5 numeric ids to current UUIDs.
 *
 * Entries hold a promise while a lookup is in flight, so concurrent callers for
 * the same id share one round trip. Failures are never cached: an outage must
 * not permanently poison an id.
 */
const legacyToNewIdCache: Record<string, string | Promise<string>> = {};

const LEGACY_ID_RE = /^\d+$/;
/** `/legacy/mapping` caps each POST at 100 ids. */
const LEGACY_MAPPING_BATCH_SIZE = 100;
/**
 * One definition of the v4 UUID shape, locked to version 4 so a malformed id
 * cannot inject extra path segments into a request URL.
 */
export const UUID_FRAGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const UUID_RE = new RegExp(`^${UUID_FRAGMENT}$`, "i");
/** Unanchored, for a UUID pasted inside a user's search text. */
export const UUID_SEARCH_RE = new RegExp(UUID_FRAGMENT, "i");

/** Trims and lowercases, then validates; undefined for anything that is not a v4 UUID. */
export function normalizeUuid(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  return UUID_RE.test(trimmed) ? trimmed : undefined;
}

function isLegacyId(id: string): boolean {
  return LEGACY_ID_RE.test(id);
}

function cacheKey(type: "manga" | "chapter", legacyId: string): string {
  return `${type}:${legacyId}`;
}

export const resolveMangaId = (id: string): Promise<string> => resolveLegacyId(id, "manga");
export const resolveChapterId = (id: string): Promise<string> => resolveLegacyId(id, "chapter");

async function resolveLegacyId(id: string, type: "manga" | "chapter"): Promise<string> {
  if (!id) {
    throw new Error(`Empty ${type} id`);
  }
  if (!isLegacyId(id)) {
    if (!UUID_RE.test(id)) {
      throw new Error(`Invalid ${type} id format: ${id}`);
    }
    return id.toLowerCase();
  }

  const key = cacheKey(type, id);
  const cached = legacyToNewIdCache[key];
  if (cached !== undefined) return cached;

  const numeric = parseInt(id, 10);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`Invalid legacy ${type} id ${id}`);
  }
  let promise!: Promise<string>;
  promise = (async (): Promise<string> => {
    try {
      const response = await fetchJSON<LegacyMappingResponse>({
        url: buildLegacyMappingUrl(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ids: [numeric] }),
      });
      const rawNewId = response.data?.find((d) => d.attributes?.legacyId === numeric)?.attributes
        ?.newId;
      const newId = normalizeUuid(rawNewId);
      if (!newId) {
        throw new Error(
          `Could not resolve legacy ${type} id ${id}. The ${type} may have been removed from MangaDex.`,
        );
      }
      if (legacyToNewIdCache[key] === promise) legacyToNewIdCache[key] = newId;
      return newId;
    } catch (e) {
      // Identity-checked so this does not clear a slot the batch path replaced.
      if (legacyToNewIdCache[key] === promise) delete legacyToNewIdCache[key];
      throw e;
    }
  })();

  legacyToNewIdCache[key] = promise;
  return promise;
}

/**
 * Batch resolution for the library-update flow. UUIDs pass through; a legacy id
 * that cannot be resolved is absent from the result, so callers skip it.
 */
export async function resolveMangaIds(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const toFetchSet = new Set<number>();
  const inFlight: Array<{ id: string; promise: Promise<string> }> = [];

  for (const id of ids) {
    if (!id) continue;
    if (!isLegacyId(id)) {
      if (UUID_RE.test(id)) out[id] = id.toLowerCase();
      continue;
    }
    const cached = legacyToNewIdCache[cacheKey("manga", id)];
    if (typeof cached === "string") {
      out[id] = cached;
      continue;
    }
    if (cached !== undefined) {
      inFlight.push({ id, promise: cached });
      continue;
    }
    const num = parseInt(id, 10);
    if (Number.isSafeInteger(num)) toFetchSet.add(num);
  }

  // Slots are reserved before the first await, so a concurrent resolveMangaId
  // finds this promise and shares the round trip instead of starting its own.
  const toFetch = Array.from(toFetchSet);
  let batchResolved: Promise<Record<string, string>> | null = null;
  if (toFetch.length > 0) {
    batchResolved = (async () => {
      const responses = await Promise.all(
        chunk(toFetch, LEGACY_MAPPING_BATCH_SIZE).map((batch) =>
          fetchJSON<LegacyMappingResponse>({
            url: buildLegacyMappingUrl(),
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "manga", ids: batch }),
          }),
        ),
      );
      const result: Record<string, string> = {};
      for (const item of responses.flatMap((r) => r.data ?? [])) {
        const { legacyId, newId } = item.attributes ?? {};
        const normalized = normalizeUuid(newId);
        if (legacyId !== undefined && normalized) result[legacyId.toString()] = normalized;
      }
      return result;
    })();

    for (const num of toFetch) {
      const key = cacheKey("manga", num.toString());
      const idPromise = batchResolved.then(
        (m): string => {
          const newId = m[num.toString()];
          if (!newId) {
            if (legacyToNewIdCache[key] === idPromise) delete legacyToNewIdCache[key];
            throw new Error(
              `Could not resolve legacy manga id ${num}. The manga may have been removed from MangaDex.`,
            );
          }
          legacyToNewIdCache[key] = newId;
          return newId;
        },
        (err: unknown): never => {
          if (legacyToNewIdCache[key] === idPromise) delete legacyToNewIdCache[key];
          throw err instanceof Error ? err : new Error(String(err));
        },
      );
      // The cached promise is awaited by real callers; this only stops the
      // rejection surfacing as unhandled before one arrives.
      idPromise.catch(() => {});
      legacyToNewIdCache[key] = idPromise;
    }
  }

  if (inFlight.length > 0) {
    // allSettled, because one unresolvable id must not reject the whole update.
    const settled = await Promise.allSettled(inFlight.map((e) => e.promise));
    for (const [i, result] of settled.entries()) {
      const entry = inFlight[i];
      if (!entry) continue;

      if (result.status === "fulfilled") {
        out[entry.id] = result.value;
        continue;
      }
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      // "Could not resolve legacy" means absent from a 200 response, which is a
      // skip. Anything else is a real failure and propagates: returning {} on a
      // transient error would let the update flow wipe every chapter list.
      if (!msg.includes("Could not resolve legacy")) {
        throw result.reason instanceof Error ? result.reason : new Error(msg);
      }
    }
  }

  if (batchResolved) {
    Object.assign(out, await batchResolved);
  }

  return out;
}
