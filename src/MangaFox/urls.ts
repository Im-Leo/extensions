/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { URL } from "@paperback/types";

import { DOMAIN } from "./models";

/**
 * Every page URL here is the site's canonical form. A directory path without its
 * trailing slash is 301-redirected to plain http, which iOS App Transport
 * Security refuses, failing the request on device while it passes on desktop.
 */

export function mangaUrl(mangaId: string): string {
  return new URL(DOMAIN).addPathComponent("manga").addPathComponent(`${mangaId}/`).toString();
}

export function chapterUrl(mangaId: string, chapterId: string): string {
  return (
    new URL(DOMAIN)
      .addPathComponent("manga")
      .addPathComponent(mangaId)
      .addPathComponent(chapterId)
      // Required, not optional: without it the site relies on a redirect that never
      // fires for ids containing a dot ("c001.1" reads as a file extension). It also
      // keeps the chapter segment in the URL, which extractChapterPages needs.
      .addPathComponent("1.html")
      .toString()
  );
}

export function directoryUrl(page: number): string {
  const url = new URL(DOMAIN).addPathComponent("directory");
  url.addPathComponent(page > 1 ? `${page}.html?news` : "?news");
  return url.toString();
}

export function releasesUrl(page: number): string {
  return new URL(DOMAIN)
    .addPathComponent("releases")
    .addPathComponent(page > 1 ? `${page}.html` : "")
    .toString();
}
