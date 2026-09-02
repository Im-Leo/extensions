/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { ContentRating } from "@paperback/types";

import { paperbackToMangaDexRatings } from "./ratings";
import type { PrecomputedQuery } from "./utils";
import { relevanceScore } from "./utils";

/**
 * A stored MangaDex rating is authoritative. Without one the Paperback rating is
 * mapped back, which is lossy — several MangaDex ratings share one Paperback
 * bucket — so any of the candidates being enabled admits the chapter.
 */
export function isRatingAllowed(
  storedMdRating: string | undefined,
  mangaPbRating: ContentRating,
  enabledRatings: readonly string[],
): boolean {
  if (storedMdRating) return enabledRatings.includes(storedMdRating);
  return (paperbackToMangaDexRatings[mangaPbRating] ?? []).some((r) => enabledRatings.includes(r));
}

/**
 * Group names are matched fuzzily, since users type them by hand and the site's
 * spelling drifts. The cache matters: this runs per chapter, per feed page.
 */
export function isGroupNameBlocked(
  name: string,
  blockedGroupQueries: PrecomputedQuery[],
  groupBlockCache: Map<string, boolean>,
): boolean {
  const cached = groupBlockCache.get(name);
  if (cached !== undefined) return cached;
  const blocked = blockedGroupQueries.some((q) => relevanceScore(name, q) >= 70);
  groupBlockCache.set(name, blocked);
  return blocked;
}
