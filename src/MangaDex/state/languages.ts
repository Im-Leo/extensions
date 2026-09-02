/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { MDLanguages } from "../languages";
import { ROMANIZED_CODES } from "../lookups";
import { getKey, readStringArray, setKey } from "./storage";

/** Which languages a title is shown in, and in what order. */

export const getLanguages = (): string[] =>
  readStringArray("languages", () => MDLanguages.getDefault());
export const setLanguages = (v: string[]): void => setKey("languages", v);
export const getLanguagePriority = (): string[] =>
  readStringArray("language_priority", getLanguages);
export const setLanguagePriority = (v: string[]): void => setKey("language_priority", v);
export const getRomanizedPriorityEnabled = (): boolean =>
  getKey("romanized_priority_enabled", false);
export const setRomanizedPriorityEnabled = (v: boolean): void =>
  setKey("romanized_priority_enabled", v);

export function getTitleLanguages(): string[] {
  const priority = getLanguagePriority();
  if (!getRomanizedPriorityEnabled()) return priority;
  const romanized = new Set<string>(ROMANIZED_CODES);
  return [...ROMANIZED_CODES, ...priority.filter((code) => !romanized.has(code))];
}

export const getNativeTitleDisplay = (): string => getKey("native_title_display", "none");
export const setNativeTitleDisplay = (v: string): void => setKey("native_title_display", v);
