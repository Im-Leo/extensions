/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { ChapterData, ChapterRelationship } from "./models";

export function extractScanlationGroupNames(chapter: ChapterData): string[] {
  return (
    chapter.relationships
      ?.filter((x: ChapterRelationship) => x?.type === "scanlation_group")
      .map((x: ChapterRelationship) => x.attributes?.["name"])
      .filter((n): n is string => !!n) ?? []
  );
}

export interface AssignedChapterNumber {
  chapNum: number;
  isUnnumbered: boolean;
}

/**
 * MangaDex allows a null chapter number, and Paperback requires one. Untitled
 * entries are numbered from their position so ordering stays stable.
 */
export function assignChapterNumber(
  rawChap: string | null | undefined,
  prevChapNum: number,
): AssignedChapterNumber {
  const rawIsEmpty = rawChap === null || rawChap === undefined || rawChap === "";
  let chapNum = rawIsEmpty ? NaN : Number(rawChap);
  const isUnnumbered = isNaN(chapNum);
  if (isUnnumbered) {
    chapNum = prevChapNum > 0 ? prevChapNum - 0.001 : 0;
  }
  return { chapNum, isUnnumbered };
}

/** Distinguishes duplicate uploads of one chapter by group and language. */
export function buildChapterIdentifier(
  chapNum: number,
  isUnnumbered: boolean,
  name: string,
  translatedLanguage: string,
  unnumberedIndex: number,
  volume: number,
  resetNumbersOnVolume: boolean,
): string {
  if (!isUnnumbered) {
    return resetNumbersOnVolume
      ? `${volume}-${chapNum}-${translatedLanguage}`
      : `${chapNum}-${translatedLanguage}`;
  }
  const key = name.trim().toLowerCase() || `idx${unnumberedIndex}`;
  return `unn-${key}-${translatedLanguage}`;
}

export function normalizePagesCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
