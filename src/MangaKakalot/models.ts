/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { DiscoverSectionType } from "@paperback/types";

export const DOMAIN = "https://www.mangakakalot.gg";

export const LANGUAGE = "en";

/** Paging cursor; absent means the last page was reached. */
export type Metadata = { page: number };

/** `path` is the `/manga-list/<path>` segment backing each section. */
export const DISCOVER_SECTIONS = [
  {
    id: "new_titles",
    title: "New Titles",
    path: "new-manga",
    // Not `featured`: Paperback does not mask the hero carousel by content
    // rating the way it masks grid tiles, so an adult cover shows unblurred
    // there however the tile is rated.
    type: DiscoverSectionType.prominentCarousel,
  },
  {
    id: "latest_updates",
    title: "Latest Updates",
    path: "latest-manga",
    type: DiscoverSectionType.chapterUpdates,
  },
  {
    id: "most_popular",
    title: "Most Popular",
    path: "hot-manga",
    type: DiscoverSectionType.simpleCarousel,
  },
  {
    id: "completed_titles",
    title: "Completed Titles",
    path: "completed-manga",
    type: DiscoverSectionType.simpleCarousel,
  },
] as const;

/** One entry of `/api/manga/<id>/chapters`, the source's only JSON endpoint. */
export interface ApiChapter {
  chapter_slug: string;
  chapter_name: string;
  chapter_num: string | number;
  updated_at: string;
}

export interface ChapterListResponse {
  success?: boolean;
  data?: { chapters?: ApiChapter[] };
}

/** One genre: the site browses `/genre/<id>` and offers no combined query. */
export type SearchMetadata = { genres?: string[] };
