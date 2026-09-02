/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { getDefaultImageQuality } from "../lookups";
import { getKey, setKey } from "./storage";

/** Image quality per surface, and which badges a tile subtitle carries. */

export const getDiscoverThumbnail = (): string =>
  getKey("discover_thumbnail", getDefaultImageQuality("discover"));
export const setDiscoverThumbnail = (v: string): void => setKey("discover_thumbnail", v);
export const getSearchThumbnail = (): string =>
  getKey("search_thumbnail", getDefaultImageQuality("search"));
export const setSearchThumbnail = (v: string): void => setKey("search_thumbnail", v);
export const getMangaThumbnail = (): string =>
  getKey("manga_thumbnail", getDefaultImageQuality("manga"));
export const setMangaThumbnail = (v: string): void => setKey("manga_thumbnail", v);

export const getShowStatusIcons = (): boolean => getKey("show_status_icons", false);
export const setShowStatusIcons = (v: boolean): void => setKey("show_status_icons", v);
export const getShowRatingIcons = (): boolean => getKey("show_content_rating_icons", false);
export const setShowRatingIcons = (v: boolean): void => setKey("show_content_rating_icons", v);
export const getShowVolume = (): boolean => getKey("show_volume_in_subtitle", true);
export const setShowVolume = (v: boolean): void => setKey("show_volume_in_subtitle", v);
export const getShowChapter = (): boolean => getKey("show_chapter_in_subtitle", true);
export const setShowChapter = (v: boolean): void => setKey("show_chapter_in_subtitle", v);
export const getShowSearchRatingInSubtitle = (): boolean =>
  getKey("show_search_rating_subtitle", false);
export const setShowSearchRatingInSubtitle = (v: boolean): void =>
  setKey("show_search_rating_subtitle", v);
export const getRelevanceScoringEnabled = (): boolean => getKey("relevance_scoring_enabled", true);
export const setRelevanceScoringEnabled = (v: boolean): void =>
  setKey("relevance_scoring_enabled", v);
