/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

export const DOMAIN = "https://fanfox.net";

/**
 * `collectedIds` carries de-duplication across pages: consecutive listing pages
 * repeat entries, which would otherwise surface as duplicate tiles.
 */
export type Metadata = { page?: number; collectedIds?: string[] };

/**
 * The site's own numeric filter values, sent as `?genres=<id>`. Static: no
 * endpoint enumerates them.
 */
export const GENRES: { id: string; title: string }[] = [
  { id: "1", title: "Action" },
  { id: "2", title: "Adventure" },
  { id: "3", title: "Comedy" },
  { id: "4", title: "Drama" },
  { id: "5", title: "Fantasy" },
  { id: "6", title: "Martial Arts" },
  { id: "7", title: "Shounen" },
  { id: "8", title: "Horror" },
  { id: "9", title: "Supernatural" },
  { id: "10", title: "Harem" },
  { id: "11", title: "Psychological" },
  { id: "12", title: "Romance" },
  { id: "13", title: "School Life" },
  { id: "14", title: "Shoujo" },
  { id: "15", title: "Mystery" },
  { id: "16", title: "Sci-fi" },
  { id: "17", title: "Seinen" },
  { id: "18", title: "Tragedy" },
  { id: "19", title: "Ecchi" },
  { id: "20", title: "Sports" },
  { id: "21", title: "Slice of Life" },
  { id: "22", title: "Mature" },
  { id: "23", title: "Shoujo Ai" },
  { id: "24", title: "Webtoons" },
  { id: "25", title: "Doujinshi" },
  { id: "26", title: "One Shot" },
  { id: "27", title: "Smut" },
  { id: "28", title: "Yaoi" },
  { id: "29", title: "Josei" },
  { id: "30", title: "Historical" },
  { id: "31", title: "Shounen Ai" },
  { id: "32", title: "Gender Bender" },
  { id: "33", title: "Adult" },
  { id: "34", title: "Yuri" },
  { id: "35", title: "Mecha" },
  { id: "36", title: "Lolicon" },
  { id: "37", title: "Shotacon" },
];

/** One genre id. The endpoint accepts no more and ignores exclusions. */
export type SearchMetadata = { genres?: string[] };
