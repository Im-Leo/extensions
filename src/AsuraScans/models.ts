/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { JSONObject, Tag } from "@paperback/types";

export const AS_DOMAIN = "https://asurascans.com";

export const AS_API_DOMAIN = "https://api.asurascans.com";

export interface AsuraMetadata extends JSONObject {
  total?: number;
  per_page?: number;
  has_more?: boolean;
  page?: number;
}

export interface Page {
  order: number;
  url: string;
}

export interface AsuraChapter {
  id: number;
  series_id: number;
  number: number;
  slug: string;
  page_count: number;
  is_premium: boolean;
  comments_enabled: boolean;
  published_at: string;
  view_count: number;
  created_at: string;
  series_slug: string;
  is_locked: boolean;
  title?: string;
  early_access_until?: string;
}

export interface AsuraChapterResponse {
  data: AsuraChapter[];
}

export interface PageData {
  url: string;
  tiles: number[];
  tile_cols: number;
  tile_rows: number;
}

export interface AsuraSearchResult {
  data: AsuraManga[];
  meta: AsuraMetadata;
}

export interface AsuraManga {
  id: number;
  slug: string;
  title: string;
  alt_titles: string[];
  description: string;
  cover: string;
  cover_url?: string;
  status: string;
  type: string;
  author: string;
  artist: string;
  popularity_rank: number;
  bookmark_count: number;
  rating: number;
  chapter_count: number;
  last_chapter_at: string;
  created_at: string;
  updated_at: string;
  public_url: string;
  source_url: string;
  genres: AsuraGenre[];
  latest_chapters: AsuraChapter[];
}

export interface AsuraGenre {
  id: number;
  name: string;
  slug: string;
}

export interface AsuraCreatorRequest {
  authors: string[];
  artists: string[];
}

export interface SearchMetadata extends JSONObject {
  genres?: string[];
  seriesStatus?: string[];
  seriesType?: string[];
  orderIsDescending?: boolean;
}

export enum TagSectionId {
  Genres = "genres",
  SeriesStatus = "status",
  SeriesType = "type",
}

export interface AsuraUser {
  id: number;
  email: string;
  email_verified_at: string;
  username: string;
  role: string;
  description: string;
  premium_until: string;
  comment_banned: boolean;
  has_custom_username: boolean;
  streak_days: number;
  has_password: boolean;
  created_at: string;
}

export interface AsuraBookmarkResponse {
  data: AsuraBookmark[];
  meta: {
    total: number;
  };
}

export interface AsuraBookmark {
  created_at: string;
  id: number;
  last_read_at: string;
  last_read_chapter: number;
  next_chapter?: number;
  series: AsuraBookmarkSeries;
  status: string;
}

export interface AsuraBookmarkSeries {
  chapter_count: number;
  cover_url: string;
  id: number;
  latest_chapter: number;
  slug: string;
  status: string;
  title: string;
  type: string;
}

export const readingStatuses = [
  { id: "reading", name: "Reading" },
  { id: "completed", name: "Completed" },
  { id: "on_hold", name: "On Hold" },
  { id: "dropped", name: "Dropped" },
  { id: "plan_to_read", name: "Plan to Read" },
] as const;
export type AsuraScansReadingStatus = (typeof readingStatuses)[number]["id"];

/** Static: the API exposes no endpoint enumerating statuses or types. */
export const statuses: Tag[] = [
  { title: "All", id: "all" },
  { title: "Ongoing", id: "ongoing" },
  { title: "Hiatus", id: "hiatus" },
  { title: "Completed", id: "completed" },
  { title: "Dropped", id: "dropped" },
];
export const types: Tag[] = [
  { title: "All", id: "all" },
  { title: "Manhwa", id: "manhwa" },
  { title: "Manhua", id: "manhua" },
  { title: "Mangatoon", id: "mangatoon" },
];
