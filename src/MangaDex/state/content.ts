/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { getDefaultRatings } from "../lookups";
import { getKey, readStringArray, setKey, THUMBNAIL_QUALITY_SCHEMA } from "./storage";

/** Content ratings, and the reader and synopsis behaviour that follows from them. */

export const getRatings = (): string[] => readStringArray("ratings", () => getDefaultRatings());
export const setRatings = (v: string[]): void => setKey("ratings", v);
export const getDataSaver = (): boolean => getKey("data_saver", false);
export const setDataSaver = (v: boolean): void => setKey("data_saver", v);
export const getForcePort443 = (): boolean => getKey("force_port_443", false);
export const setForcePort443 = (v: boolean): void => setKey("force_port_443", v);
export const getSkipSameChapter = (): boolean => getKey("skip_same_chapter", false);
export const setSkipSameChapter = (v: boolean): void => setKey("skip_same_chapter", v);
export const getIncludeUnavailable = (): boolean => getKey("include_unavailable", false);
export const setIncludeUnavailable = (v: boolean): void => setKey("include_unavailable", v);

export const getShowAltTitlesInSynopsis = (): boolean =>
  getKey("show_alt_titles_in_synopsis", false);
export const setShowAltTitlesInSynopsis = (v: boolean): void =>
  setKey("show_alt_titles_in_synopsis", v);
export const getShowFinalChapterInSynopsis = (): boolean =>
  getKey("show_final_chapter_in_synopsis", false);
export const setShowFinalChapterInSynopsis = (v: boolean): void =>
  setKey("show_final_chapter_in_synopsis", v);
export const getTryFirstVolumeCover = (): boolean => getKey("try_first_volume_cover", false);
export const setTryFirstVolumeCover = (v: boolean): void => setKey("try_first_volume_cover", v);

let stateMigrationsRan = false;

export function runStateMigrations(): void {
  if (stateMigrationsRan) return;
  const schema = Application.getState("thumbnail_quality_schema") as number | undefined;
  if (schema !== THUMBNAIL_QUALITY_SCHEMA) {
    for (const key of ["discover_thumbnail", "search_thumbnail"]) {
      if (Application.getState(key) === "source") {
        Application.setState(undefined, key);
      }
    }
    Application.setState(THUMBNAIL_QUALITY_SCHEMA, "thumbnail_quality_schema");
  }
  stateMigrationsRan = true;
}
