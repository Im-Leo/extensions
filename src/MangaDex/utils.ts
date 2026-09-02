/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { distance as levenshtein } from "fastest-levenshtein";
import { stemmer } from "stemmer";

import type { Metadata } from "./models";

/** MangaDex rejects an offset at or beyond this. */
export const MAX_API_OFFSET = 10000;

export const MANGA_PAGE_LIMIT = 100;
export const FEED_PAGE_LIMIT = 500;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** A 404 reaches callers in three shapes, depending on which layer threw. */
export function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("[404]") || msg.includes("HTTP 404") || msg.includes("404 MangaDex Request Failed")
  );
}

/**
 * `/manga?ids[]` answers in arbitrary order, so the caller's order is reimposed.
 * Ids absent from the response are dropped.
 */
export function reorderById<T extends { id: string }>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const byId = new Map(items.map((m) => [m.id, m]));
  return orderedIds.flatMap((id) => {
    const m = byId.get(id);
    return m ? [m] : [];
  });
}

/** Undefined ends paging: a short page, the total reached, or the offset cap. */
export function computeNextMetadata(
  offset: number,
  returned: number,
  total: number | undefined,
  pageSize: number,
): Metadata | undefined {
  if (returned < pageSize) return undefined;
  if (typeof total === "number" && offset + returned >= total) return undefined;
  const nextOffset = offset + pageSize;
  if (nextOffset >= MAX_API_OFFSET) return undefined;
  return { offset: nextOffset };
}

/** Anchored to the start of the UTC day; the API rejects milliseconds and a zone. */
export function formatCreatedAtSince(ms: number): string {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 19);
}

export function formatPublishAtSince(date: Date | undefined): string | undefined {
  if (!(date instanceof Date) || isNaN(date.getTime())) return undefined;
  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

/** Falls back to the epoch, so chapter sorting never sees an Invalid Date. */
export function parseDateOrEpoch(value: string | number | null | undefined): Date {
  const d = new Date(value ?? 0);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/** The variant that lets a caller tell "no date" from a real one. */
export function parseDateOrUndefined(value: string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

/** A threshold of 1 means "any at all"; above 1 it is a percentage of the total. */
export function shouldSkipByCount(
  threshold: number,
  count: number | undefined,
  total: number | undefined,
): boolean {
  if (threshold <= 0 || count === undefined || !total) return false;
  if (threshold === 1) return count > 0;
  return (count / total) * 100 >= threshold;
}

export function decodeHTML(text: string): string {
  if (!text || !text.includes("&")) return text;
  return Application.decodeHTMLEntities(text) ?? text;
}

export function parseJSONBody<T>(data: unknown, status: number): T {
  if (typeof data !== "string") {
    return data as T;
  }

  let i = 0;
  const n = data.length;
  while (i < n) {
    const c = data.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
    i++;
  }
  const firstChar = i < n ? data.charAt(i) : "";
  if (firstChar === "{" || firstChar === "[") {
    try {
      return JSON.parse(data) as T;
    } catch {}
  }

  if (status >= 500) {
    throw new Error(`${status} MangaDex Unavailable`);
  }
  if (status >= 400) {
    throw new Error(`${status} MangaDex Request Failed`);
  }
  const snippet = data.slice(i, i + 80).replace(/\s+/g, " ");
  throw new Error(`Unexpected non JSON response from MangaDex (status ${status}): ${snippet}`);
}

export interface PrecomputedQuery {
  words: string[];
  phrase: string;
  stripped: string;
  startRegex: RegExp | null;
  anywhereRegex: RegExp | null;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasAsciiWord = (s: string): boolean => /[A-Za-z0-9]/.test(s);

/** Hoists the per-query work out of {@link relevanceScore}, called once per title. */
export function precomputeQuery(queryTitle: string): PrecomputedQuery {
  const words = tokenize(queryTitle).map((w) => stemmer(w));
  const phrase = words.join(" ");
  const stripped = words.join("");
  const escapedPhrase = escapeRegExp(phrase);
  const buildRegex = hasAsciiWord(phrase);
  return {
    words,
    phrase,
    stripped,
    startRegex: buildRegex ? new RegExp(`^${escapedPhrase}\\b`, "i") : null,
    anywhereRegex: buildRegex ? new RegExp(`\\b${escapedPhrase}\\b`, "i") : null,
  };
}

/**
 * Ranks a title against the query. MangaDex's own ordering ignores the search
 * text once filters are applied, so results are re-sorted locally.
 */
export const relevanceScore = (title: string, query: PrecomputedQuery): number => {
  if (query.words.length === 0) {
    return 0;
  }

  const titleWords = tokenize(title).map((w) => stemmer(w));
  const titleStripped = titleWords.join("");

  if (titleStripped === query.stripped) {
    return 100;
  }

  const titlePhrase = titleWords.join(" ");
  if (query.startRegex && query.startRegex.test(titlePhrase)) {
    return 99;
  }
  if (query.anywhereRegex && query.anywhereRegex.test(titlePhrase)) {
    return 95;
  }

  const adjacentMatchIndex = findAdjacentSequence(titleWords, query.words);
  if (adjacentMatchIndex === 0) {
    return 90;
  } else if (adjacentMatchIndex > 0) {
    return 85;
  }

  const matchIndices: number[] = Array.from({ length: query.words.length });
  let allPresent = true;
  for (const [k, queryWord] of query.words.entries()) {
    let found = -1;
    for (const [i, titleWord] of titleWords.entries()) {
      if (stemmedWordSimilarity(queryWord, titleWord) >= 0.7) {
        found = i;
        break;
      }
    }
    matchIndices[k] = found;
    if (found < 0) {
      allPresent = false;
    }
  }
  if (allPresent) {
    let inOrder = true;
    for (let k = 1; k < matchIndices.length; k++) {
      // The sweep above fills every slot; a gap can only be an undefined
      // comparison, which never satisfies the condition below.
      const current = matchIndices[k];
      const previous = matchIndices[k - 1];
      if (current === undefined || previous === undefined) continue;

      if (current <= previous) {
        inOrder = false;
        break;
      }
    }
    if (!inOrder) {
      let titlePos = 0;
      inOrder = true;
      for (const queryWord of query.words) {
        let found = -1;
        for (let i = titlePos; i < titleWords.length; i++) {
          const titleWord = titleWords[i];
          if (titleWord === undefined) continue;

          if (stemmedWordSimilarity(queryWord, titleWord) >= 0.7) {
            found = i;
            break;
          }
        }
        if (found < 0) {
          inOrder = false;
          break;
        }
        titlePos = found + 1;
      }
    }
    return inOrder ? 80 : 75;
  }

  const matchedQueryWords = getMatchedQueryWordsCount(titleWords, query.words);
  const proportionMatched = matchedQueryWords / query.words.length;

  let totalSimilarity = 0;
  for (const queryWord of query.words) {
    let maxSimilarity = 0;
    for (const titleWord of titleWords) {
      const similarity = stemmedWordSimilarity(queryWord, titleWord);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }
    totalSimilarity += maxSimilarity;
  }
  const averageSimilarity = totalSimilarity / query.words.length;
  return averageSimilarity * 70 * proportionMatched;
};

const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/[\s\-_]+/)
    .filter((word) => word.length > 0);
};

const getMatchedQueryWordsCount = (titleWords: string[], queryWords: string[]): number =>
  queryWords.filter((queryWord) =>
    titleWords.some((titleWord) => stemmedWordSimilarity(queryWord, titleWord) >= 0.7),
  ).length;

const findAdjacentSequence = (titleWords: string[], queryWords: string[]): number => {
  if (queryWords.length === 0 || titleWords.length < queryWords.length) return -1;
  for (let i = 0; i <= titleWords.length - queryWords.length; i++) {
    let allMatch = true;
    for (let j = 0; j < queryWords.length; j++) {
      const queryWord = queryWords[j];
      const titleWord = titleWords[i + j];

      if (
        queryWord === undefined ||
        titleWord === undefined ||
        stemmedWordSimilarity(queryWord, titleWord) < 0.7
      ) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return i;
  }
  return -1;
};

const stemmedWordSimilarity = (a: string, b: string): number => {
  if (a === b) {
    return 1.0;
  }

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  if (minLen >= 3 && minLen / maxLen >= 0.5 && (a.includes(b) || b.includes(a))) {
    return 0.8;
  }

  const distance = levenshtein(a, b);
  const similarity = (maxLen - distance) / maxLen;

  if (similarity >= 0.6) {
    return similarity;
  }

  return 0;
};
