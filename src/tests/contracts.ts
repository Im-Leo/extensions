/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type {
  Chapter,
  ChapterDetails,
  DiscoverSectionItem,
  GenresCarouselItem,
  SearchResultItem,
  SourceManga,
} from "@paperback/types";
import { expect } from "chai";

/**
 * Assertions describing what Paperback actually needs from an extension.
 *
 * The bar is deliberately higher than "not empty": a result of
 * `[{ mangaId: "", title: "x", imageUrl: "" }]` satisfies that and renders as a
 * blank shelf. Every field checked here is one the app silently drops or
 * mis-renders when it is wrong.
 */

/** Only image chapters carry `pages`; novel and file chapters carry other shapes. */
export function isImageChapter(
  details: ChapterDetails,
): details is Extract<ChapterDetails, { pages: string[] }> {
  return "pages" in details;
}

/** Asserts the chapter is an image chapter and hands back its pages. */
export function imagePagesOf(details: ChapterDetails, context = "ChapterDetails"): string[] {
  expect(isImageChapter(details), `${context}: must be an image chapter`).to.equal(true);
  return isImageChapter(details) ? details.pages : [];
}

/** Every discover tile but the genres one addresses a manga. */
export function isMangaTile(
  item: DiscoverSectionItem,
): item is Exclude<DiscoverSectionItem, GenresCarouselItem> {
  return item.type !== "genresCarouselItem";
}

/** Paperback resolves image URLs itself, so a relative path never loads. */
function assertLoadableImage(url: string | undefined, context: string): void {
  expect(url, `${context}: imageUrl missing`).to.be.a("string").and.not.equal("");
  expect(
    url?.startsWith("https://") || url?.startsWith("data:"),
    `${context}: imageUrl must be absolute https or a data URI, got "${url?.slice(0, 40)}"`,
  ).to.equal(true);
}

export function assertSearchResultItem(item: SearchResultItem, context = "SearchResultItem"): void {
  expect(item.mangaId, `${context}: mangaId must be non-empty`).to.be.a("string").and.not.equal("");
  expect(item.title, `${context}: title must be non-empty`).to.be.a("string").and.not.equal("");
  assertLoadableImage(item.imageUrl, context);
}

export function assertDiscoverSectionItem(
  item: DiscoverSectionItem,
  context = "DiscoverSectionItem",
): void {
  if (item.type === "genresCarouselItem") {
    expect(item.name, `${context}: genre item needs a name`).to.be.a("string").and.not.equal("");
    expect(item.searchQuery, `${context}: genre item needs a searchQuery`).to.not.equal(undefined);
    return;
  }

  expect(item.mangaId, `${context}: mangaId must be non-empty`).to.be.a("string").and.not.equal("");
  expect(item.title, `${context}: title must be non-empty`).to.be.a("string").and.not.equal("");
  assertLoadableImage(item.imageUrl, context);
}

export function assertSourceManga(manga: SourceManga, context = "SourceManga"): void {
  expect(manga.mangaId, `${context}: mangaId must be non-empty`)
    .to.be.a("string")
    .and.not.equal("");

  const info = manga.mangaInfo;
  expect(info, `${context}: mangaInfo missing`).to.not.equal(undefined);
  expect(info.primaryTitle, `${context}: primaryTitle must be non-empty`)
    .to.be.a("string")
    .and.not.equal("");
  expect(info.contentRating, `${context}: contentRating must be set`).to.not.equal(undefined);
  assertLoadableImage(info.thumbnailUrl, context);
}

export function assertChapter(chapter: Chapter, context = "Chapter"): void {
  expect(chapter.chapterId, `${context}: chapterId must be non-empty`)
    .to.be.a("string")
    .and.not.equal("");
  expect(
    Number.isFinite(chapter.chapNum),
    `${context}: chapNum must be finite, got ${chapter.chapNum}`,
  ).to.equal(true);

  if (chapter.publishDate !== undefined) {
    expect(
      Number.isFinite(chapter.publishDate.getTime()),
      `${context}: publishDate must be a valid Date`,
    ).to.equal(true);
  }
}

export function assertChapterDetails(details: ChapterDetails, context = "ChapterDetails"): void {
  expect(details.id, `${context}: id must be non-empty`).to.be.a("string").and.not.equal("");
  expect(isImageChapter(details), `${context}: must be an image chapter`).to.equal(true);
  if (!isImageChapter(details)) return;

  expect(details.pages, `${context}: pages must not be empty`).to.be.an("array");
  expect(details.pages.length, `${context}: pages must not be empty`).to.be.greaterThan(0);

  details.pages.forEach((page, index) => assertLoadableImage(page, `${context} page ${index}`));
}

/**
 * A duplicate interceptor id silently displaces one registration. When that hit
 * MangaFox and MangaKakalot it removed the interceptor supplying the `Referer`
 * their image CDNs require, so every cover 403'd while HTML kept working.
 */
export function assertUniqueInterceptorIds(extension: object, context: string): void {
  const ids = Object.values(extension)
    .filter((value): value is { id: string } => typeof (value as { id?: unknown })?.id === "string")
    .map((value) => value.id);

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  expect(duplicates.length, `${context}: interceptors share ids ${duplicates.join(", ")}`).to.equal(
    0,
  );
}
