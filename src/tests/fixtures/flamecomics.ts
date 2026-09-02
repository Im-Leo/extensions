/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type {
  ChapterReaderResponse,
  HomepageResponse,
  SeriesDetailResponse,
  SeriesListItem,
  SimpleSeriesListItem,
} from "../../FlameComics/models.js";

/** Payloads are `_next/data` page props; only the fields parsers touch are filled. */
export function makeSeries(overrides: Partial<SeriesListItem> = {}): SeriesListItem {
  return {
    series_id: 1,
    title: "Example Series",
    cover: "cover.webp",
    last_edit: 1_700_000_000,
    ...overrides,
  };
}

export const SIMPLE_SERIES: SimpleSeriesListItem[] = [{ id: 1, chapter_count: "37" }];

/** The two ways a novel is detectable — both must be filtered out. */
export const NOVEL_BY_ID = makeSeries({ series_id: 2, novel_id: 99, title: "A Novel" });
export const NOVEL_BY_TYPE = makeSeries({ series_id: 3, type: "Web Novel", title: "Also A Novel" });

export const HOMEPAGE: HomepageResponse = {
  pageProps: {
    popularEntries: {
      blocks: [{ title: "Popular", series: [makeSeries(), NOVEL_BY_ID] }],
    },
    latestEntries: {
      blocks: [
        {
          title: "Latest",
          series: [
            makeSeries({
              chapters: [
                { series_id: 1, chapter: "131.00", release_date: 1_700_000_500, token: "tok131" },
              ],
            }),
          ],
        },
      ],
    },
    staffPicks: { blocks: [{ title: "Staff", series: [makeSeries({ series_id: 4 })] }] },
    carousel: [],
  },
};

export const SERIES_DETAIL: SeriesDetailResponse = {
  pageProps: {
    series: {
      series_id: 1,
      title: "Example Series",
      altTitles: ["Alt One"],
      description: "<p>A &amp; B synopsis</p>",
      tags: ["Action", "Drama"],
      author: ["Author One"],
      artist: ["Artist One"],
      status: "Ongoing",
      cover: "cover.webp",
      last_edit: 1_700_000_000,
    },
    chapters: [
      {
        chapter_id: 10,
        series_id: 1,
        chapter: "204.00",
        release_date: 1_700_000_900,
        token: "tok204",
      },
      { chapter_id: 9, series_id: 1, chapter: "9.5", release_date: 1_700_000_800, token: "tok9" },
    ],
  },
};

/**
 * Page keys are strings, listed out of order and spanning double digits, so a
 * lexicographic sort ("10" before "2") produces visibly wrong page order.
 */
export const CHAPTER_READER: ChapterReaderResponse = {
  pageProps: {
    token: "tok204",
    chapter: {
      series_id: 1,
      chapter_id: 10,
      chapter: "204.00",
      token: "tok204",
      release_date: 1_700_000_900,
      edit_time: 1_700_000_900,
      title: "Example Series",
      cover: "cover.webp",
      images: {
        "10": { size: 1, type: ["jpg"], name: "page-10.jpg", modified: "", width: 1, height: 1 },
        "2": { size: 1, type: ["jpg"], name: "page-02.jpg", modified: "", width: 1, height: 1 },
        "1": { size: 1, type: ["jpg"], name: "page-01.jpg", modified: "", width: 1, height: 1 },
      },
    },
  },
};

/**
 * The two `_next/data` failure envelopes. Both are valid JSON returned with HTTP
 * 404, so neither throws on parse and each needs opposite handling.
 */

/** A series the site no longer knows about; carries no `pageProps` at all. */
export const NOT_FOUND_PAYLOAD = { notFound: true } as unknown as SeriesDetailResponse;

/** What a rotated build id returns: the envelope is present but empty. */
export const STALE_BUILD_PAYLOAD = {
  __N_SSG: true,
  pageProps: {},
} as unknown as SeriesDetailResponse;
