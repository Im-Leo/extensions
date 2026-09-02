/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type {
  Chapter,
  ChapterDetails,
  DiscoverSectionItem,
  SearchResultItem,
  SortingOption,
  SourceManga,
  Tag,
  TagSection,
} from "@paperback/types";

import { rateContent } from "../utils/content-rating";
import { DOMAIN } from "./models";
import type {
  ChapterDetail,
  ChapterReaderResponse,
  FlameFilter,
  HomepageResponse,
  OptionItem,
  SearchFiltersMeta,
  SearchMetadata,
  SeriesDetail,
  SeriesDetailResponse,
  SeriesListItem,
  SimpleSeriesListItem,
  SortableListItem,
  TristateParsed,
} from "./models";
import { buildChapterImageUrl, buildSeriesCoverUrl } from "./network";

/**
 * Wire payloads into Paperback domain objects.
 *
 * The site offers no search endpoint and no server-side pagination, so this
 * module also does the work an API would normally do: the listing routes are
 * merged into one candidate set, then filtered and sorted locally.
 */

/** Chapter numbers arrive zero-padded: `"75.00"` renders as `"75"`. */
const formatChapNum = (raw: string): string => {
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? raw : String(n);
};

const extractTextFromHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();

const getRelativeTime = (unixEpochSeconds: number): string => {
  const secondsAgo = Math.floor(Date.now() / 1000) - unixEpochSeconds;
  if (secondsAgo < 60) return "just now";
  if (secondsAgo < 3600) return `${Math.round(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.round(secondsAgo / 3600)}h ago`;
  if (secondsAgo < 2592000) return `${Math.round(secondsAgo / 86400)}d ago`;
  if (secondsAgo < 31536000) return `${Math.round(secondsAgo / 2592000)}mo ago`;
  return `${Math.round(secondsAgo / 31536000)}y ago`;
};

/** Genres are `categories` on the listing routes and `tags` on the detail route. */
const seriesGenres = (series: { categories?: string[]; tags?: string[] }): string[] => [
  ...(series.categories ?? []),
  ...(series.tags ?? []),
];

/** Novels have no pages to render, so they are excluded from every listing. */
export const isNovel = (item: SeriesListItem): boolean =>
  item.novel_id != null || (item.type?.toLowerCase().includes("novel") ?? false);

/** `latest.json` omits most metadata; `browse.json` carries it for the same ids. */
export const enrichLatestWithBrowseData = (
  latest: SeriesListItem[],
  browse: SeriesListItem[],
): SeriesListItem[] => {
  const browseMap = new Map(browse.map((item) => [item.series_id, item]));
  return latest.map((item) => {
    const b = browseMap.get(item.series_id);
    return {
      ...item,
      year: item.year || b?.year,
      description: item.description || b?.description,
      categories: item.categories || b?.categories,
      author: item.author || b?.author,
      artist: item.artist || b?.artist,
      publisher: item.publisher || b?.publisher,
      time: item.time || b?.time,
    };
  });
};

/** Normalises one listing shape into the merged form, defaulting absent fields. */
const toSortableItem = (
  browseItem: SeriesListItem,
  simpleItem: SimpleSeriesListItem | undefined,
): SortableListItem => ({
  series_id: browseItem.series_id,
  title: browseItem.title,
  description: browseItem.description ?? "",
  language: browseItem.language ?? "English",
  type: browseItem.type ?? "",
  categories: browseItem.categories ?? browseItem.tags ?? [],
  country: browseItem.country ?? "",
  author: browseItem.author ?? [],
  artist: browseItem.artist ?? [],
  publisher: browseItem.publisher ?? [],
  year: browseItem.year ?? 0,
  status: browseItem.status ?? "",
  likes: browseItem.likes ?? 0,
  cover: browseItem.cover,
  last_edit: browseItem.last_edit,
  updated: browseItem.updated ?? browseItem.last_edit,
  time: browseItem.time ?? browseItem.last_edit,
  chapter_count: Number(simpleItem?.chapter_count ?? 0),
  chapters: browseItem.chapters ?? [],
});

/** Joins the listing payload to `/api/series`, the only source of `chapter_count`. */
export const toSortableList = (
  browse: SeriesListItem[],
  simple: SimpleSeriesListItem[],
): SortableListItem[] => {
  const simpleMap = new Map(simple.map((item) => [item.id, item]));
  return browse.map((item) => toSortableItem(item, simpleMap.get(item.series_id)));
};

export const toSearchResultItem = (
  item: SortableListItem,
  sortingOption: SortingOption,
): SearchResultItem => {
  const latestChapter = item.chapters?.[0];

  let subtitle = latestChapter
    ? "Ch. " + formatChapNum(latestChapter.chapter)
    : item.chapter_count.toString() + " Chaps";

  switch (sortingOption.id) {
    case "year":
      subtitle += " | " + item.year;
      break;
    case "likes":
      subtitle += " | " + item.likes.toString() + " ♥";
      break;
    case "latest":
      subtitle += " | " + getRelativeTime(item.updated);
      break;
  }

  return {
    mangaId: String(item.series_id),
    title: item.title,
    imageUrl: buildSeriesCoverUrl(item.series_id, item.cover, item.last_edit),
    contentRating: rateContent(seriesGenres(item)),
    subtitle,
  };
};

export const parseHomepageSection = (
  sectionId: string,
  response: HomepageResponse,
): { items: DiscoverSectionItem[]; metadata: undefined } => {
  const props = response.pageProps;

  switch (sectionId) {
    case "popular": {
      const series = (props.popularEntries?.blocks?.[0]?.series ?? []).filter((s) => !isNovel(s));
      return {
        items: series.map((s) => ({
          type: "featuredCarouselItem" as const,
          mangaId: String(s.series_id),
          title: s.title,
          imageUrl: buildSeriesCoverUrl(s.series_id, s.cover, s.last_edit),
          contentRating: rateContent(seriesGenres(s)),
          subtitle: s.type ?? "",
        })),
        metadata: undefined,
      };
    }

    case "latest": {
      const series = (props.latestEntries?.blocks?.[0]?.series ?? []).filter((s) => !isNovel(s));
      const items: DiscoverSectionItem[] = series.map((s) => {
        const topChapter = s.chapters?.[0];
        return {
          type: "chapterUpdatesCarouselItem",
          mangaId: String(s.series_id),
          // Both halves are needed to fetch pages, and a tile carries no other slot.
          chapterId: topChapter ? `${s.series_id}:${topChapter.token}` : String(s.series_id),
          title: s.title,
          imageUrl: buildSeriesCoverUrl(s.series_id, s.cover, s.last_edit),
          contentRating: rateContent(seriesGenres(s)),
          subtitle: topChapter ? `Ch. ${formatChapNum(topChapter.chapter)}` : (s.type ?? ""),
          publishDate: topChapter ? new Date(topChapter.release_date * 1000) : undefined,
        };
      });
      return { items, metadata: undefined };
    }

    case "staff": {
      const series = (props.staffPicks?.blocks?.[0]?.series ?? []).filter((s) => !isNovel(s));
      return {
        items: series.map((s) => ({
          type: "prominentCarouselItem" as const,
          mangaId: String(s.series_id),
          title: s.title,
          imageUrl: buildSeriesCoverUrl(s.series_id, s.cover, s.last_edit),
          contentRating: rateContent(seriesGenres(s)),
          subtitle: s.type ?? "",
        })),
        metadata: undefined,
      };
    }

    default:
      return { items: [], metadata: undefined };
  }
};

export const parseSeriesDetail = (
  seriesId: string,
  response: SeriesDetailResponse,
): SourceManga => {
  const series: SeriesDetail | undefined = response.pageProps?.series;
  if (!series) throw new Error(`FlameComics: empty series payload for id=${seriesId}`);

  const genreTags: Tag[] = (series.tags ?? []).map((t) => ({
    id: t.toLowerCase().replace(/\s+/g, "-"),
    title: t,
  }));
  const tagSections: TagSection[] = [{ id: "genres", title: "Genres", tags: genreTags }];
  const cover = buildSeriesCoverUrl(series.series_id, series.cover, series.last_edit);

  return {
    mangaId: seriesId,
    mangaInfo: {
      thumbnailUrl: cover,
      synopsis: extractTextFromHtml(series.description ?? ""),
      primaryTitle: series.title,
      secondaryTitles: series.altTitles ?? [],
      contentRating: rateContent(seriesGenres(series)),
      status: series.status ?? "Unknown",
      // The site publishes no separate banner art.
      bannerUrl: cover,
      artist: (series.artist ?? []).join(", "),
      author: (series.author ?? []).join(", "),
      rating: 0,
      tagGroups: tagSections,
      shareUrl: `${DOMAIN}/series/${series.series_id}`,
    },
  };
};

export const parseChapters = (
  sourceManga: SourceManga,
  response: SeriesDetailResponse,
): Chapter[] => {
  const chapters: ChapterDetail[] = response.pageProps?.chapters ?? [];
  return chapters.map((c) => {
    const chapNum = Number.parseFloat(c.chapter) || 0;
    return {
      chapterId: `${c.series_id}:${c.token}`,
      sourceManga,
      langCode: "en",
      chapNum,
      title: c.title && c.title.length > 0 ? c.title : `Chapter ${formatChapNum(c.chapter)}`,
      volume: 0,
      sortingIndex: chapNum,
      publishDate: new Date(c.release_date * 1000),
      additionalInfo: { token: c.token },
    } satisfies Chapter;
  });
};

export const parseChapterDetails = (
  chapterId: string,
  response: ChapterReaderResponse,
): ChapterDetails => {
  const chapter = response.pageProps.chapter;
  // Page keys are strings, so a default sort would place "10" before "2".
  const pages = Object.entries(chapter.images)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, img]) => buildChapterImageUrl(chapter.series_id, chapter.token, img.name));

  return { id: chapterId, mangaId: String(chapter.series_id), pages };
};

/** Option ids travel in form state; escape what `encodeURIComponent` leaves. */
const textToId = (text: string): string =>
  encodeURIComponent(text).replace(
    /[!'()*~]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );

const textToOptionItem = (text: string): OptionItem => ({ id: textToId(text), value: text });

/**
 * Builds each field's option list from the candidates themselves, since the site
 * publishes no filter vocabulary beyond types, status and year.
 */
export const buildFilterOptions = (
  candidates: SortableListItem[],
  initialFilters: SearchFiltersMeta,
): FlameFilter => {
  const categoriesSet = new Set<string>();
  const publisherSet = new Set<string>();
  const authorSet = new Set<string>();
  const artistSet = new Set<string>();
  const languageSet = new Set<string>();
  const countrySet = new Set<string>();

  for (const candidate of candidates) {
    candidate.categories?.forEach((c) => categoriesSet.add(c));
    candidate.publisher?.forEach((p) => publisherSet.add(p));
    candidate.author?.forEach((a) => authorSet.add(a));
    candidate.artist?.forEach((a) => artistSet.add(a));
    if (candidate.language) languageSet.add(candidate.language);
    if (candidate.country) countrySet.add(candidate.country);
  }

  return {
    categories: [...categoriesSet].map(textToOptionItem),
    types: initialFilters?.types.filter((t) => t != "all").map(textToOptionItem),
    publisher: [...publisherSet].map(textToOptionItem),
    status: initialFilters?.status.filter((t) => t != "all").map(textToOptionItem),
    author: [...authorSet].map(textToOptionItem),
    artist: [...artistSet].map(textToOptionItem),
    year: initialFilters?.year.filter((t) => t != "all").map(textToOptionItem),
    language: [...languageSet].map(textToOptionItem),
    country: [...countrySet].map(textToOptionItem),
  };
};

/** Splits one tristate selection into the names to require and the names to reject. */
const parseTristateFilter = (
  filterMap: Record<string, "included" | "excluded"> | undefined,
  availableOptions: OptionItem[],
): TristateParsed => {
  if (!filterMap || Object.keys(filterMap).length === 0) {
    return { hasFilters: false, requestedNames: [], rejectedNames: [] };
  }

  const rejectedIds: string[] = [];
  const requestedIds = Object.keys(filterMap).filter((id) => {
    if (filterMap[id] === "included") return true;
    rejectedIds.push(id);
    return false;
  });

  const nameOf = (id: string) => availableOptions.find((opt) => opt.id === id)?.value;
  return {
    hasFilters: true,
    requestedNames: requestedIds.map(nameOf),
    rejectedNames: rejectedIds.map(nameOf),
  };
};

/** A rejection always wins; `isExclusive` then demands all requested names, not any. */
const passesTristateFilter = (
  candidateFieldValues: (string | undefined)[],
  requestedNames: (string | undefined)[],
  rejectedNames: (string | undefined)[],
  isExclusive: boolean,
): boolean => {
  if (rejectedNames.some((name) => candidateFieldValues.includes(name))) return false;
  if (requestedNames.length === 0) return true;

  const matchCount = requestedNames.filter((name) => candidateFieldValues.includes(name)).length;
  return isExclusive ? matchCount === requestedNames.length : matchCount > 0;
};

export const applyAdvancedFilters = (
  candidates: SortableListItem[],
  selectedFilters: SearchMetadata,
  availableFilters: FlameFilter,
): SortableListItem[] => {
  const categories = parseTristateFilter(selectedFilters.categories, availableFilters.categories);
  const publisher = parseTristateFilter(selectedFilters.publisher, availableFilters.publisher);
  const author = parseTristateFilter(selectedFilters.author, availableFilters.author);
  const artist = parseTristateFilter(selectedFilters.artist, availableFilters.artist);
  const categoriesAnd = (selectedFilters.categoriesMode ?? "or") === "and";

  const wantTypes = (selectedFilters.types?.length ?? 0) > 0;
  const wantStatus = (selectedFilters.status?.length ?? 0) > 0;
  const wantYear = (selectedFilters.year?.length ?? 0) > 0;

  return candidates.filter((candidate) => {
    if (
      categories.hasFilters &&
      !passesTristateFilter(
        candidate.categories ?? [],
        categories.requestedNames,
        categories.rejectedNames,
        categoriesAnd,
      )
    )
      return false;

    if (
      publisher.hasFilters &&
      !passesTristateFilter(
        candidate.publisher ?? [],
        publisher.requestedNames,
        publisher.rejectedNames,
        false,
      )
    )
      return false;

    if (
      author.hasFilters &&
      !passesTristateFilter(
        candidate.author ?? [],
        author.requestedNames,
        author.rejectedNames,
        false,
      )
    )
      return false;

    if (
      artist.hasFilters &&
      !passesTristateFilter(
        candidate.artist ?? [],
        artist.requestedNames,
        artist.rejectedNames,
        false,
      )
    )
      return false;

    if (wantTypes && !selectedFilters.types?.includes(candidate.type)) return false;
    if (wantStatus && !selectedFilters.status?.includes(candidate.status)) return false;
    if (wantYear && !selectedFilters.year?.includes(candidate.year.toString())) return false;
    if (selectedFilters.language && selectedFilters.language !== candidate.language) return false;
    if (selectedFilters.country && selectedFilters.country !== candidate.country) return false;

    return true;
  });
};
