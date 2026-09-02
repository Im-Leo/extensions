/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { JSONObject } from "@paperback/types";

/**
 * Wire types for flamecomics.xyz.
 *
 * The site is a Next.js app scraped through its `_next/data/<buildId>/*.json`
 * routes, so these mirror page props rather than a designed API. Two
 * consequences shape the extension: the listing routes return the entire
 * catalogue in one payload, and there is no server-side search — both are why
 * `parsers.ts` aggregates, filters and paginates locally.
 */

export const DOMAIN = "https://flamecomics.xyz";
export const CDN = "https://cdn.flamecomics.xyz";

/** Seconds since the Unix epoch; every timestamp on this site is encoded this way. */
type UnixSeconds = number;

/** A decimal chapter number carried as a string, e.g. `"131.00"`. */
type ChapterNumber = string;

/** Hex token addressing a chapter: `/series/<series_id>/<token>`. */
type ChapterToken = string;

/** A boolean the site encodes as 0 or 1. */
type IntBoolean = number;

/**
 * A series as the listing routes return it. Field presence varies by route: the
 * genre listing sends `categories`, the homepage sends `tags`, and only
 * `latest.json` carries `chapters`.
 */
export interface SeriesListItem {
  series_id: number;
  novel_id?: number | null;
  title: string;
  description?: string;
  language?: string;
  type?: string;
  categories?: string[];
  tags?: string[];
  country?: string;
  author?: string[];
  artist?: string[];
  publisher?: string[];
  year?: number;
  status?: string;
  likes?: number;
  cover: string;
  /** Doubles as the cache-buster on cover URLs. */
  last_edit: UnixSeconds;
  updated?: UnixSeconds;
  time?: UnixSeconds;
  chapters?: ChapterListItem[];
}

/** The reduced chapter shape embedded in listing payloads. */
export interface ChapterListItem {
  series_id: number;
  chapter: ChapterNumber;
  title?: string;
  language?: string;
  release_date: UnixSeconds;
  token: ChapterToken;
}

/**
 * `/api/series` — a plain REST route, and the only one exposing `chapter_count`.
 * It also returns `label`, `status` and `image`, unused here because the
 * `_next/data` payloads carry richer versions of the same fields.
 */
export interface SimpleSeriesListItem {
  id: number;
  chapter_count: string;
}

/** A listing series merged with its `/api/series` entry, ready to sort and filter. */
export interface SortableListItem {
  series_id: number;
  title: string;
  description: string;
  language: string;
  type: string;
  categories: string[];
  country: string;
  author: string[];
  artist: string[];
  publisher: string[];
  year: number;
  status: string;
  likes: number;
  cover: string;
  last_edit: UnixSeconds;
  time: UnixSeconds;
  updated: UnixSeconds;
  chapter_count: number;
  chapters?: ChapterListItem[];
}

export interface SearchFiltersMeta {
  year: string[];
  search: string;
  status: string[];
  types: string[];
  order: "asc" | "desc";
}

export interface SearchPageProps {
  series: SeriesListItem[];
  initialFilters: SearchFiltersMeta;
}

/** `browse.json` */
export interface SearchProps {
  pageProps: SearchPageProps;
  __N_SSG?: boolean;
  cookies?: Record<string, string>;
}

export interface LatestPageProps {
  allSeries: SeriesListItem[];
  keywordsMeta: string;
}

/** `latest.json` */
export interface LatestProps {
  pageProps: LatestPageProps;
  __N_SSG?: boolean;
  cookies?: Record<string, string>;
}

export interface HomepageBlock {
  title: string;
  showChapters?: boolean;
  carousel?: boolean;
  series: SeriesListItem[];
}

export interface HomepageBlockContainer {
  blocks: HomepageBlock[];
}

export interface HomepageCarouselItem {
  id: number;
  series_id: number | null;
  novel_id: number | null;
  title: string;
  categories?: string[];
  language?: string;
  /** Filename only; the URL is `/uploads/images/carousel/<image>`. */
  image: string;
  link?: string | null;
}

export interface HomepagePageProps {
  popularEntries: HomepageBlockContainer;
  latestEntries: HomepageBlockContainer;
  staffPicks: HomepageBlockContainer;
  carousel: HomepageCarouselItem[];
  keywordsMeta?: string;
  announcements?: unknown[];
}

/** `index.json` */
export interface HomepageResponse {
  pageProps: HomepagePageProps;
  __N_SSG?: boolean;
}

export interface SeriesDetail {
  series_id: number;
  title: string;
  altTitles?: string[];
  description?: string;
  language?: string;
  type?: string;
  /** Genres; the detail route names them `tags` where listings use `categories`. */
  tags?: string[];
  country?: string;
  author?: string[];
  artist?: string[];
  publisher?: string[];
  year?: number;
  status?: string;
  /** Free text, e.g. a weekday or the literal `"schedule"`. */
  schedule?: string;
  likes?: number;
  cover: string;
  draft?: IntBoolean;
  official?: string;
  last_edit: UnixSeconds;
  time?: UnixSeconds;
}

export interface ChapterDetail {
  chapter_id: number;
  series_id: number;
  chapter: ChapterNumber;
  title?: string;
  cover?: IntBoolean;
  release_date: UnixSeconds;
  token: ChapterToken;
  /** Cache-buster for this chapter's page images. */
  edit_time?: UnixSeconds;
}

export interface SeriesDetailPageProps {
  series: SeriesDetail;
  chapters: ChapterDetail[];
}

/** `series/<series_id>.json` — serves the series and its chapter list together. */
export interface SeriesDetailResponse {
  pageProps: SeriesDetailPageProps;
}

export interface ChapterImage {
  size: number;
  type: string[];
  name: string;
  /** ISO 8601. */
  modified: string;
  width: number;
  height: number;
}

export interface ChapterReaderData {
  series_id: number;
  chapter_id: number;
  chapter: ChapterNumber;
  chapter_title?: string;
  /**
   * Keyed by page index as a string, so pages must be ordered numerically —
   * a lexicographic sort puts "10" before "2".
   */
  images: Record<string, ChapterImage>;
  language?: string;
  draft?: IntBoolean;
  hidden?: IntBoolean;
  token: ChapterToken;
  release_date: UnixSeconds;
  edit_time: UnixSeconds;
  unix_timestamp?: UnixSeconds;
  title: string;
  altTitles?: string[];
  tags?: string[];
  description?: string;
  cover: string;
}

/** `series/<series_id>/<token>.json` */
export interface ChapterReaderResponse {
  pageProps: {
    chapter: ChapterReaderData;
    token: ChapterToken;
    previous?: string | null;
    next?: string | null;
  };
}

export interface Metadata extends JSONObject {
  page: number;
}

/** The user's advanced-search selections, applied locally against the aggregate. */
export type SearchMetadata = {
  /** Lowercased genre slug to its tristate. */
  categories?: { [id: string]: "included" | "excluded" };
  categoriesMode?: "or" | "and";
  types?: string[];
  publisher?: { [id: string]: "included" | "excluded" };
  status?: string[];
  author?: { [id: string]: "included" | "excluded" };
  artist?: { [id: string]: "included" | "excluded" };
  year?: string[];
  language?: string;
  country?: string;
  order?: "asc" | "desc";
};

export type OptionItem = {
  value: string;
  id: string;
};

/** The option lists backing each advanced-search field, built from the aggregate. */
export class FlameFilter {
  categories: OptionItem[] = [];
  types: OptionItem[] = [];
  publisher: OptionItem[] = [];
  status: OptionItem[] = [];
  author: OptionItem[] = [];
  artist: OptionItem[] = [];
  year: OptionItem[] = [];
  language: OptionItem[] = [];
  country: OptionItem[] = [];
}

export interface TristateParsed {
  hasFilters: boolean;
  requestedNames: (string | undefined)[];
  rejectedNames: (string | undefined)[];
}
