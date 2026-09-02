/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { UUID_FRAGMENT } from "./legacy";

export type SearchPrefix = "id" | "ch" | "grp" | "usr" | "author" | "list";

export interface DispatchedSearch {
  prefix: SearchPrefix;
  uuid: string;
}

/**
 * A pasted MangaDex URL or a `prefix:uuid` string is treated as a direct lookup
 * rather than a title search, so the query box doubles as an address bar.
 */
const URL_PATH_TO_PREFIX: Record<string, SearchPrefix> = {
  title: "id",
  chapter: "ch",
  group: "grp",
  author: "author",
  user: "usr",
  list: "list",
};

const URL_PATTERN = new RegExp(
  `mangadex\\.org\\/(title|chapter|group|author|user|list)\\/(${UUID_FRAGMENT})`,
  "i",
);
const PREFIX_PATTERN = new RegExp(`^(id|ch|grp|usr|author|list):\\s*(${UUID_FRAGMENT})`, "i");
/** Pre-v5 numeric URLs still circulate and resolve through `/legacy/mapping`. */
const LEGACY_URL_PATTERN = /mangadex\.org\/(title|chapter)\/(\d+)/i;
const LEGACY_PREFIX_PATTERN = /^(id|ch):\s*(\d+)\s*$/i;

function captures(match: RegExpMatchArray | null): [string, string] | undefined {
  const [, first, second] = match ?? [];
  return first !== undefined && second !== undefined ? [first, second] : undefined;
}

export function dispatchSearch(rawTitle: string | undefined): DispatchedSearch | undefined {
  const trimmed = rawTitle?.trim();
  if (!trimmed) return undefined;

  const url = captures(trimmed.match(URL_PATTERN));
  if (url) {
    const [path, uuid] = url;
    const prefix = URL_PATH_TO_PREFIX[path.toLowerCase()];
    if (prefix) return { prefix, uuid: uuid.toLowerCase() };
  }

  const prefixed = captures(trimmed.match(PREFIX_PATTERN));
  if (prefixed) {
    const [prefix, uuid] = prefixed;
    return { prefix: prefix.toLowerCase() as SearchPrefix, uuid: uuid.toLowerCase() };
  }

  const legacyUrl = captures(trimmed.match(LEGACY_URL_PATTERN));
  if (legacyUrl) {
    const [path, id] = legacyUrl;
    const prefix = URL_PATH_TO_PREFIX[path.toLowerCase()];
    if (prefix) return { prefix, uuid: id };
  }

  const legacyPrefixed = captures(trimmed.match(LEGACY_PREFIX_PATTERN));
  if (legacyPrefixed) {
    const [prefix, id] = legacyPrefixed;
    return { prefix: prefix.toLowerCase() as SearchPrefix, uuid: id };
  }

  return undefined;
}
