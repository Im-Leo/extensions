/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { getKey, setKey } from "./storage";

export const DISCOVER_SECTIONS = {
  POPULAR: "popular",
  LATEST_UPDATES: "latest_updates",
  RECOMMENDED: "recommended",
  SELF_PUBLISHED: "self_published",
  SEASONAL: "seasonal",
  RECENTLY_ADDED: "recently_added",
};

export const DEFAULT_SECTION_ORDER = [
  DISCOVER_SECTIONS.POPULAR,
  DISCOVER_SECTIONS.LATEST_UPDATES,
  DISCOVER_SECTIONS.RECOMMENDED,
  DISCOVER_SECTIONS.SELF_PUBLISHED,
  DISCOVER_SECTIONS.SEASONAL,
  DISCOVER_SECTIONS.RECENTLY_ADDED,
];

/** Bump when adding a section, so a saved order missing it is discarded. */
const DISCOVER_SECTION_ORDER_SCHEMA = 2;

export function getDiscoverSectionOrder(): string[] {
  const savedSchema = Application.getState("discover_section_order_schema") as number | undefined;
  if (savedSchema !== DISCOVER_SECTION_ORDER_SCHEMA) {
    Application.setState(undefined, "discover_section_order");
    Application.setState(DISCOVER_SECTION_ORDER_SCHEMA, "discover_section_order_schema");
    return DEFAULT_SECTION_ORDER.slice();
  }

  const rawOrder = Application.getState("discover_section_order") as string[] | undefined;
  if (!rawOrder || !Array.isArray(rawOrder)) {
    return DEFAULT_SECTION_ORDER.slice();
  }

  const validIds = new Set(DEFAULT_SECTION_ORDER);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of rawOrder) {
    if (validIds.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  for (const id of DEFAULT_SECTION_ORDER) {
    if (!seen.has(id)) result.push(id);
  }

  const changed = result.length !== rawOrder.length || result.some((id, i) => id !== rawOrder[i]);
  if (changed) {
    Application.setState(result, "discover_section_order");
  }
  return result;
}

export function setDiscoverSectionOrder(order: string[]): void {
  Application.setState(order, "discover_section_order");
  Application.setState(DISCOVER_SECTION_ORDER_SCHEMA, "discover_section_order_schema");
}

export const getPopularEnabled = (): boolean => getKey("popular_enabled", true);
export const setPopularEnabled = (v: boolean): void => setKey("popular_enabled", v);
export const getLatestUpdatesEnabled = (): boolean => getKey("latest_updates_enabled", true);
export const setLatestUpdatesEnabled = (v: boolean): void => setKey("latest_updates_enabled", v);
export const getRecommendedEnabled = (): boolean => getKey("recommended_enabled", true);
export const setRecommendedEnabled = (v: boolean): void => setKey("recommended_enabled", v);
export const getSelfPublishedEnabled = (): boolean => getKey("self_published_enabled", true);
export const setSelfPublishedEnabled = (v: boolean): void => setKey("self_published_enabled", v);
export const getSeasonalEnabled = (): boolean => getKey("seasonal_enabled", true);
export const setSeasonalEnabled = (v: boolean): void => setKey("seasonal_enabled", v);
export const getRecentlyAddedEnabled = (): boolean => getKey("recently_added_enabled", true);
export const setRecentlyAddedEnabled = (v: boolean): void => setKey("recently_added_enabled", v);

export interface DiscoverSectionDefinition {
  id: string;
  title: string;
  type: "prominentCarousel" | "chapterUpdates" | "simpleCarousel" | "featured";
  getEnabled: () => boolean;
  setEnabled: (value: boolean) => void;
}

export const SECTION_DEFINITIONS: readonly DiscoverSectionDefinition[] = [
  {
    id: DISCOVER_SECTIONS.POPULAR,
    title: "Popular New Titles",
    type: "prominentCarousel",
    getEnabled: getPopularEnabled,
    setEnabled: setPopularEnabled,
  },
  {
    id: DISCOVER_SECTIONS.LATEST_UPDATES,
    title: "Latest Updates",
    type: "chapterUpdates",
    getEnabled: getLatestUpdatesEnabled,
    setEnabled: setLatestUpdatesEnabled,
  },
  {
    id: DISCOVER_SECTIONS.RECOMMENDED,
    title: "Recommended",
    type: "simpleCarousel",
    getEnabled: getRecommendedEnabled,
    setEnabled: setRecommendedEnabled,
  },
  {
    id: DISCOVER_SECTIONS.SELF_PUBLISHED,
    title: "Self-Published",
    type: "simpleCarousel",
    getEnabled: getSelfPublishedEnabled,
    setEnabled: setSelfPublishedEnabled,
  },
  {
    id: DISCOVER_SECTIONS.SEASONAL,
    title: "Seasonal",
    type: "featured",
    getEnabled: getSeasonalEnabled,
    setEnabled: setSeasonalEnabled,
  },
  {
    id: DISCOVER_SECTIONS.RECENTLY_ADDED,
    title: "Recently Added",
    type: "simpleCarousel",
    getEnabled: getRecentlyAddedEnabled,
    setEnabled: setRecentlyAddedEnabled,
  },
];
