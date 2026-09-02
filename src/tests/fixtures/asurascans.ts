/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { AsuraChapter, AsuraManga } from "../../AsuraScans/models.js";

/**
 * AsuraScans is a JSON API, so fixtures are objects. `AsuraManga` carries some
 * twenty fields of which the parsers read a handful; these factories fill the
 * rest so each test states only what it exercises.
 */
export function makeChapter(overrides: Partial<AsuraChapter> = {}): AsuraChapter {
  return {
    id: 1001,
    series_id: 1,
    number: 12,
    slug: "chapter-12",
    page_count: 20,
    is_premium: false,
    comments_enabled: true,
    published_at: "2026-01-10T00:00:00Z",
    view_count: 0,
    created_at: "2026-01-10T00:00:00Z",
    series_slug: "example-series",
    is_locked: false,
    ...overrides,
  };
}

export function makeManga(overrides: Partial<AsuraManga> = {}): AsuraManga {
  return {
    id: 42,
    slug: "example-series",
    title: "Example Series",
    alt_titles: ["Alt One"],
    description: "<p>First line.</p><p>Second line.</p>",
    cover: "https://cdn.asurascans.com/covers/fallback.webp",
    cover_url: "https://cdn.asurascans.com/covers/preferred.webp",
    status: "Ongoing",
    type: "manhwa",
    author: "Author Name",
    artist: "Artist Name",
    popularity_rank: 1,
    bookmark_count: 0,
    rating: 9,
    chapter_count: 12,
    last_chapter_at: "2026-01-10T00:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-01-10T00:00:00Z",
    public_url: "https://asurascans.com/series/example-series",
    source_url: "",
    genres: [{ id: 1, slug: "action", name: "Action" }],
    latest_chapters: [makeChapter()],
    ...overrides,
  };
}

/** A pending unlock: the chapter is early access. */
export const FUTURE_DATE = new Date(Date.now() + 86_400_000).toISOString();

/** An elapsed unlock: the chapter is freely readable. */
export const PAST_DATE = new Date(Date.now() - 86_400_000).toISOString();
