/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { ContentRating } from "@paperback/types";

import { RATINGS } from "./lookups";

/**
 * Translation between MangaDex's content ratings and Paperback's.
 *
 * The two vocabularies are not the same size, so the reverse direction is
 * one-to-many and every consumer has to treat it as a set of candidates.
 */

export const contentRatingMap: Record<string, ContentRating> = Object.fromEntries(
  RATINGS.map((r) => [r.enum, r.paperback]),
);

/** An unrecognised rating is treated as ADULT: the safe direction to be wrong in. */
export function resolvePaperbackRating(rawContentRating: string): ContentRating {
  return contentRatingMap[rawContentRating] ?? ContentRating.ADULT;
}

/**
 * The reverse of {@link contentRatingMap}, and lossy: several MangaDex ratings
 * share one Paperback bucket, so each maps to every candidate.
 */
export const paperbackToMangaDexRatings: Record<ContentRating, string[]> = (() => {
  const out: Record<ContentRating, string[]> = {
    [ContentRating.EVERYONE]: [],
    [ContentRating.MATURE]: [],
    [ContentRating.ADULT]: [],
  };
  for (const r of RATINGS) {
    out[r.paperback].push(r.enum);
  }
  return out;
})();

/** Subtitle icon per rating, used where a rating is shown rather than filtered. */
export const ratingIconMap: Record<string, string> = Object.fromEntries(
  RATINGS.map((r) => [r.enum, r.icon]),
);
