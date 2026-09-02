/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { ContentRating, SourceManga, Tag, TagSection } from "@paperback/types";

import { ROMANIZED_CODES, STATUSES } from "./lookups";
import type {
  AggregateResponse,
  AltTitle,
  ChapterAttributes,
  DatumAttributes,
  Links,
  MangaDetailsResponse,
  MangaItem,
  Relationship,
  StatisticsResponse,
} from "./models";
import { MANGADEX_DOMAIN, Status } from "./models";
import { ratingIconMap, resolvePaperbackRating } from "./ratings";
import { buildCoverImageUrl, extractCoverImageUrl } from "./relationships";
import {
  getLanguagePriority,
  getMangaThumbnail,
  getNativeTitleDisplay,
  getRelevanceScoringEnabled,
  getRomanizedPriorityEnabled,
  getShowAltTitlesInSynopsis,
  getShowChapter,
  getShowFinalChapterInSynopsis,
  getShowRatingIcons,
  getShowSearchRatingInSubtitle,
  getShowStatusIcons,
  getShowVolume,
  getTitleLanguages,
} from "./state";
import { decodeHTML, precomputeQuery, relevanceScore } from "./utils";

const statusIconMap: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.enum, s.icon]),
);

type MangaItemWithAdditionalInfo = {
  mangaId: string;
  title: string;
  imageUrl: string;
  subtitle?: string;
  contentRating?: ContentRating;
};

type MangaItemDetails = {
  primaryTitle: string;
  preferredLanguageTitle?: string;
  secondaryTitles: string[];
  synopsis: string;
  status: Status;
  contentRating: ContentRating;
  mdContentRating: string;
  tagGroups: TagSection[];
  shareUrl: string;
};

/**
 * The API marks a series completed before the final chapter is uploaded, so a
 * stored "Completed" is only trusted once the feed actually contains it.
 */
export function reconcileStoredCompletedStatus(
  apiStatus: Status,
  storedStatus: string | undefined,
): Status {
  if (apiStatus === Status.Completed && storedStatus === Status.PublishingFinished) {
    return Status.PublishingFinished;
  }
  return apiStatus;
}

export function aggregateContainsLastChapter(
  aggregate: AggregateResponse | undefined,
  lastChapter: string | null | undefined,
  lastVolume?: string | null,
): boolean {
  if (!lastChapter) return false;
  const allVolumes = Object.values(aggregate?.volumes ?? {});
  if (allVolumes.length === 0) return false;
  const candidates =
    lastVolume !== null && lastVolume !== undefined && lastVolume !== ""
      ? allVolumes.filter((v) => v.volume === lastVolume)
      : allVolumes;
  return candidates.some((v) =>
    Object.prototype.hasOwnProperty.call(v.chapters ?? {}, lastChapter),
  );
}

const ZWJ_PADDING = " ".repeat(30) + " ‍";

export function assertDataArray<T>(
  json: { data?: unknown },
  contextLabel: string,
): asserts json is { data: T[] } {
  if (!Array.isArray(json.data)) {
    throw new Error(`Failed to load results for ${contextLabel}, check MangaDex status`);
  }
}

const getFirstLanguageMatch = (
  values: Record<string, string | undefined> | undefined,
  languages: readonly string[],
): string | undefined => {
  if (!values) return undefined;
  for (const lang of languages) {
    const match = values[lang];
    if (match) return match;
  }
  return undefined;
};

const getFirstLanguageMatchFromAlt = (
  altTitles: AltTitle[] | undefined,
  languages: readonly string[],
): string | undefined => {
  if (!altTitles) return undefined;
  for (const lang of languages) {
    for (const alt of altTitles) {
      if (!alt || typeof alt !== "object") continue;
      const match = (alt as Record<string, string | undefined>)[lang];
      if (match) return match;
    }
  }
  return undefined;
};

const getFirstValue = (
  values: Record<string, string | undefined> | undefined,
): string | undefined => Object.values(values ?? {}).find((v) => v);

const flattenDecodedAltTitles = (altTitles: AltTitle[] | undefined): string[] =>
  altTitles
    ?.filter((x): x is AltTitle => !!x && typeof x === "object")
    .flatMap((x) => Object.values(x))
    .filter((v): v is string => typeof v === "string")
    .map(decodeHTML) ?? [];

const resolvePrimaryTitleRaw = (
  title: Record<string, string | undefined> | undefined,
  altTitles: AltTitle[] | undefined,
  languages: readonly string[],
  romanizedEnabled: boolean,
): string => {
  const romanizedMatch = romanizedEnabled
    ? (getFirstLanguageMatch(title, ROMANIZED_CODES) ??
      getFirstLanguageMatchFromAlt(altTitles, ROMANIZED_CODES))
    : undefined;
  return (
    romanizedMatch ??
    getFirstLanguageMatch(title, languages) ??
    getFirstLanguageMatchFromAlt(altTitles, languages) ??
    getFirstValue(title) ??
    ""
  );
};

export const parseMangaList = (
  object: MangaItem[],
  thumbnailSelector: () => string,
  queryTitle?: string,
  ratingJson?: StatisticsResponse,
  chapterDetailsMap?: Record<string, ChapterAttributes>,
): MangaItemWithAdditionalInfo[] => {
  const results: { manga: MangaItemWithAdditionalInfo; relevance: number }[] = [];

  const precomputedQuery =
    queryTitle && getRelevanceScoringEnabled() ? precomputeQuery(queryTitle) : null;

  const thumbnailQuality = thumbnailSelector();
  const languages = getTitleLanguages();
  const romanizedPriorityEnabled = getRomanizedPriorityEnabled();
  const showStatusIcons = getShowStatusIcons();
  const showRatingIcons = getShowRatingIcons();
  const showChapter = getShowChapter();
  const showVolume = getShowVolume();
  const showSearchRatingInSubtitle = getShowSearchRatingInSubtitle();
  const relevanceScoringEnabled = getRelevanceScoringEnabled();

  for (const manga of object) {
    if (!manga || !manga.attributes) continue;
    const mangaId = manga.id;
    const mangaDetails = manga.attributes;
    const title = decodeHTML(
      resolvePrimaryTitleRaw(
        mangaDetails.title as Record<string, string | undefined>,
        mangaDetails.altTitles,
        languages,
        romanizedPriorityEnabled,
      ),
    );

    const image = extractCoverImageUrl(manga.relationships, mangaId, thumbnailQuality);

    const statusIcon = showStatusIcons
      ? statusIconMap[(mangaDetails.status as string)?.toLowerCase() ?? ""] || ""
      : "";
    const ratingIcon = showRatingIcons
      ? ratingIconMap[(mangaDetails.contentRating as string)?.toLowerCase() ?? ""] || ""
      : "";

    let chapterVolume: string | undefined;
    let chapterNumber: string | undefined;
    if (chapterDetailsMap) {
      const latestChapterId = manga.attributes.latestUploadedChapter;
      const latestChapterDetails = latestChapterId ? chapterDetailsMap[latestChapterId] : undefined;
      if (latestChapterDetails) {
        chapterVolume = latestChapterDetails.volume ?? undefined;
        chapterNumber = latestChapterDetails.chapter ?? undefined;
      }
    } else {
      chapterVolume = mangaDetails.lastVolume ?? undefined;
      chapterNumber = mangaDetails.lastChapter ?? undefined;
    }

    const chapterInfo = parseChapterTitle(
      { title: undefined, volume: chapterVolume, chapter: chapterNumber },
      { showVolume, showChapter, compact: showSearchRatingInSubtitle },
    );

    const rating = ratingJson?.statistics?.[mangaId]?.rating?.average
      ? (ratingJson.statistics[mangaId].rating.average * 10).toFixed(0) + "%"
      : "";

    const iconPrefix = `${ratingIcon}${statusIcon}${rating}`;
    const subtitle = (iconPrefix ? `${iconPrefix} ${chapterInfo}` : chapterInfo).trim();

    let displayTitle = title;
    if (
      showChapter ||
      showVolume ||
      showRatingIcons ||
      showSearchRatingInSubtitle ||
      showStatusIcons ||
      (title.length > 0 && title.length < 35)
    ) {
      displayTitle += ZWJ_PADDING;
    }

    let relevance = 0;
    if (precomputedQuery) {
      relevance = flattenDecodedAltTitles(mangaDetails.altTitles).reduce(
        (max, alt) => Math.max(max, relevanceScore(alt, precomputedQuery)),
        relevanceScore(title, precomputedQuery),
      );
    }

    results.push({
      manga: {
        mangaId: mangaId,
        title: displayTitle,
        imageUrl: image,
        subtitle: subtitle,
        contentRating: resolvePaperbackRating(
          (mangaDetails.contentRating as string)?.toLowerCase() ?? "",
        ),
      },
      relevance: relevance,
    });
  }

  if (queryTitle && relevanceScoringEnabled) {
    results.sort((a, b) => b.relevance - a.relevance);
  }
  return results.map((r) => r.manga);
};

export const parseMangaDetails = (
  mangaId: string,
  json: MangaDetailsResponse,
  ratingJson?: StatisticsResponse,
  settings?: MangaDetailsSettings,
  aggregate?: AggregateResponse,
  coverFileNameOverride?: string,
): SourceManga => {
  if (!json.data || !json.data.attributes) {
    throw new Error(`MangaDex returned no manga data for ${mangaId}`);
  }
  const mangaDetails: DatumAttributes = json.data.attributes;

  const mangaItemDetails = parseMangaItemDetails(mangaId, mangaDetails, settings, aggregate);

  const joinCreditNames = (type: string): string | undefined =>
    json.data?.relationships
      ?.filter((x): x is Relationship => x?.type === type)
      .map((x) => x.attributes?.name)
      .filter(Boolean)
      .join(", ") || undefined;

  let author = joinCreditNames("author");
  let artist = joinCreditNames("artist");

  let synopsis = mangaItemDetails.synopsis;

  const nativeTitleDisplay = settings?.nativeTitleDisplay ?? getNativeTitleDisplay();
  const preferredTitle = mangaItemDetails.preferredLanguageTitle;
  if (preferredTitle && preferredTitle !== mangaItemDetails.primaryTitle) {
    if (nativeTitleDisplay === "author") {
      author = preferredTitle;
      artist = undefined;
    } else if (nativeTitleDisplay === "author_desc") {
      const credits: string[] = [];
      if (author) credits.push(author);
      if (artist && artist !== author) credits.push(artist);
      const suffix = credits.length > 0 ? ` (${credits.join(", ")})` : "";
      author = `${preferredTitle}${suffix}`;
      artist = undefined;
    }
  }

  const thumbnailQuality = settings?.mangaThumbnail ?? getMangaThumbnail();
  const image = coverFileNameOverride
    ? buildCoverImageUrl(mangaId, coverFileNameOverride, thumbnailQuality)
    : extractCoverImageUrl(json.data.relationships, mangaId, thumbnailQuality);

  const rating = ratingJson?.statistics?.[mangaId]?.rating?.average
    ? ratingJson.statistics[mangaId].rating.average / 10
    : undefined;

  return {
    mangaId: mangaId,
    mangaInfo: {
      primaryTitle: mangaItemDetails.primaryTitle,
      secondaryTitles: mangaItemDetails.secondaryTitles,
      thumbnailUrl: image,
      author,
      artist,
      synopsis,
      status: mangaItemDetails.status,
      tagGroups: mangaItemDetails.tagGroups,
      contentRating: mangaItemDetails.contentRating,
      shareUrl: mangaItemDetails.shareUrl,
      rating,
      additionalInfo: mangaDetails.latestUploadedChapter
        ? {
            mdContentRating: mangaItemDetails.mdContentRating,
            latestUploadedChapter: mangaDetails.latestUploadedChapter,
          }
        : { mdContentRating: mangaItemDetails.mdContentRating },
    },
  };
};

export interface MangaDetailsSettings {
  titleLanguages: readonly string[];
  romanizedPriorityEnabled: boolean;
  languagePriority: readonly string[];
  nativeTitleDisplay: string;
  mangaThumbnail?: string;
  showAltTitlesInSynopsis?: boolean;
  showFinalChapterInSynopsis?: boolean;
}

export function readMangaTitleSettings(): MangaDetailsSettings {
  return {
    titleLanguages: getTitleLanguages(),
    romanizedPriorityEnabled: getRomanizedPriorityEnabled(),
    languagePriority: getLanguagePriority(),
    nativeTitleDisplay: getNativeTitleDisplay(),
    showAltTitlesInSynopsis: getShowAltTitlesInSynopsis(),
    showFinalChapterInSynopsis: getShowFinalChapterInSynopsis(),
  };
}

export function readMangaDetailsSettings(): MangaDetailsSettings {
  return {
    ...readMangaTitleSettings(),
    mangaThumbnail: getMangaThumbnail(),
  };
}

export function parseMangaItemDetails(
  mangaId: string,
  mangaDetails: DatumAttributes,
  settings?: MangaDetailsSettings,
  aggregate?: AggregateResponse,
): MangaItemDetails {
  const resolvedSettings = settings ?? readMangaTitleSettings();
  const languages = resolvedSettings.titleLanguages;

  const primaryTitle: string = decodeHTML(
    resolvePrimaryTitleRaw(
      mangaDetails.title as Record<string, string | undefined>,
      mangaDetails.altTitles,
      languages,
      resolvedSettings.romanizedPriorityEnabled,
    ),
  );

  const priorityLanguages = resolvedSettings.languagePriority;
  const preferredMatch =
    getFirstLanguageMatch(
      mangaDetails.title as Record<string, string | undefined>,
      priorityLanguages,
    ) ?? getFirstLanguageMatchFromAlt(mangaDetails.altTitles, priorityLanguages);
  const preferredLanguageTitle = preferredMatch ? decodeHTML(preferredMatch) : undefined;

  const secondaryTitles: string[] = Array.from(
    new Set(flattenDecodedAltTitles(mangaDetails.altTitles).filter((v) => v !== primaryTitle)),
  );

  const description = mangaDetails.description as Record<string, string | undefined> | undefined;
  const descriptionMatch =
    getFirstLanguageMatch(description, languages) ?? description?.["en"] ?? "";

  const desc = decodeHTML(descriptionMatch).replace(/\[\/?[bus]]/g, "");

  const links = mangaDetails.links as Links | undefined;
  const trackers = (
    [
      ["al", "AniList"],
      ["mu", "MangaUpdates"],
      ["mal", "MyAnimeList"],
    ] as const
  )
    .filter(([key]) => Boolean(links?.[key]))
    .map(([, name]) => name);

  const synopsisParts: string[] = [];

  if (resolvedSettings.showAltTitlesInSynopsis && secondaryTitles.length > 0) {
    const altsToShow =
      resolvedSettings.nativeTitleDisplay === "description" && preferredLanguageTitle
        ? secondaryTitles.filter((t) => t !== preferredLanguageTitle)
        : secondaryTitles;
    if (altsToShow.length > 0) {
      synopsisParts.push(`Alternative Titles:\n${altsToShow.join("\n")}`);
    }
  }

  if (
    resolvedSettings.nativeTitleDisplay === "description" &&
    preferredLanguageTitle &&
    preferredLanguageTitle !== primaryTitle
  ) {
    synopsisParts.push(preferredLanguageTitle);
  }

  if (desc) synopsisParts.push(desc);

  if (trackers.length > 0) {
    synopsisParts.push(`Tracking available for:\n${trackers.join("\n")}`);
  }

  if (resolvedSettings.showFinalChapterInSynopsis && mangaDetails.status === Status.Completed) {
    const tags: string[] = [];
    const lastVol = mangaDetails.lastVolume?.trim();
    const lastCh = mangaDetails.lastChapter?.trim();
    if (lastVol) tags.push(`Vol.${lastVol}`);
    if (lastCh) tags.push(`Ch.${lastCh}`);
    if (tags.length > 0) synopsisParts.push(`Final: ${tags.join(" ")}`);
  }

  const synopsis = synopsisParts.join("\n\n");

  const status: Status =
    mangaDetails.status === Status.Completed &&
    aggregate !== undefined &&
    !aggregateContainsLastChapter(aggregate, mangaDetails.lastChapter, mangaDetails.lastVolume)
      ? Status.PublishingFinished
      : mangaDetails.status;

  const tagsByGroup = new Map<string, Tag[]>();
  for (const apiTag of mangaDetails.tags ?? []) {
    const groupId = apiTag.attributes?.group ?? "tags";
    let groupTags = tagsByGroup.get(groupId);
    if (!groupTags) {
      groupTags = [];
      tagsByGroup.set(groupId, groupTags);
    }
    groupTags.push({
      id: apiTag.id,
      title: apiTag.attributes?.name?.en ?? "Unknown",
    });
  }
  const tagGroups: TagSection[] = Array.from(tagsByGroup.entries())
    .map(([groupId, groupTags]) => {
      groupTags.sort((a, b) => a.title.localeCompare(b.title));
      const title =
        groupId === "tags" ? "Tags" : groupId.charAt(0).toUpperCase() + groupId.slice(1);
      return { id: groupId, title, tags: groupTags };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const rawContentRating = (mangaDetails.contentRating as string)?.toLowerCase() ?? "";
  return {
    primaryTitle,
    preferredLanguageTitle,
    secondaryTitles,
    synopsis,
    status,
    tagGroups,
    contentRating: resolvePaperbackRating(rawContentRating),
    mdContentRating: rawContentRating,
    shareUrl: `${MANGADEX_DOMAIN}/title/${mangaId}`,
  };
}

export interface ChapterTitleOptions {
  showVolume?: boolean;
  showChapter?: boolean;
  compact?: boolean;
}

export function parseChapterTitle(
  attributes: Partial<ChapterAttributes>,
  options?: ChapterTitleOptions,
): string {
  const title = decodeHTML(attributes.title?.trim() || "");
  const showVolume = options?.showVolume ?? getShowVolume();
  const showChapter = options?.showChapter ?? getShowChapter();
  const compact = options?.compact ?? getShowSearchRatingInSubtitle();

  const volumePrefix = compact ? "V." : "Vol.";
  const chapterPrefix = compact ? "C." : "Ch.";
  const volume = showVolume && attributes.volume ? `${volumePrefix} ${attributes.volume} ` : "";
  const chapter = showChapter && attributes.chapter ? `${chapterPrefix} ${attributes.chapter}` : "";
  const prefix = `${volume}${chapter}`.trim();

  if (prefix && title) return `${prefix} - ${title}`;
  return prefix || title;
}
