/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/** What {@link applyTagFilters} resolves a tag selection into. */
export type TagFilters = {
  ratings: string[];
  includedTags: string[];
  excludedTags: string[];
};

import type { SortingOption } from "@paperback/types";

import type { MangaDexSearchMetadata } from "../forms/search";
import { ORIGINAL_LANGUAGES } from "../lookups";
import { CONTENT_RATING_GROUP, SYNTHETIC_RATING_ID_TO_NAME } from "../tags";

/**
 * Translation of the advanced-search form's selections into API query options.
 *
 * Everything here is pure, so the parameters the endpoint receives can be
 * asserted without making a request.
 */

/** "Chinese" covers both `zh` and `zh-hk`; the API needs them listed separately. */
export function expandOriginalLanguages(selected: readonly string[]): string[] {
  if (!selected || selected.length === 0) return [];
  const out: string[] = [];
  for (const code of selected) {
    out.push(code);
    const extras = ORIGINAL_LANGUAGES.find((l) => l.enum === code)?.extraCodes;
    if (extras) out.push(...extras);
  }
  return out;
}

export function parseYearInput(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d{4}$/.test(trimmed)) return undefined;
  const year = Number(trimmed);
  return year > 0 ? year : undefined;
}

export function applyTagFilters(
  tagsByGroup: MangaDexSearchMetadata["tagsByGroup"],
  baseRatings: string[],
): TagFilters {
  const ratings = new Set(baseRatings);
  const includedTags: string[] = [];
  const excludedTags: string[] = [];
  if (tagsByGroup) {
    for (const [groupId, tagMap] of Object.entries(tagsByGroup)) {
      if (groupId === CONTENT_RATING_GROUP) {
        for (const [id, status] of Object.entries(tagMap)) {
          const rating = SYNTHETIC_RATING_ID_TO_NAME[id];
          if (!rating) continue;
          if (status === "excluded") ratings.delete(rating);
          else if (status === "included") ratings.add(rating);
        }
      } else {
        for (const [tagId, status] of Object.entries(tagMap)) {
          if (status === "included") includedTags.push(tagId);
          else if (status === "excluded") excludedTags.push(tagId);
        }
      }
    }
  }
  return { ratings: [...ratings], includedTags, excludedTags };
}

export function resolveSortOrder(
  sortingOption: SortingOption | undefined,
  isTitleSearch: boolean,
): { orderKey?: string; orderValue?: "asc" | "desc" } {
  const id = sortingOption?.id;
  if (id) {
    const index = id.lastIndexOf("-");
    if (index > 0) {
      const key = id.substring(0, index);
      const value = id.substring(index + 1);
      const skipRelevance = key === "order[relevance]" && !isTitleSearch;
      if ((value === "asc" || value === "desc") && !skipRelevance) {
        return { orderKey: key, orderValue: value };
      }
    }
  }
  if (isTitleSearch) {
    return { orderKey: "order[relevance]", orderValue: "desc" };
  }
  return {};
}
