/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { CheerioAPI } from "cheerio";

/**
 * Page-image extraction.
 *
 * Page URLs are not in the markup. They come from a Dean Edwards-packed script
 * (`function(p,a,c,k,e,d)`), and for paginated chapters from a per-page
 * `chapterfun.ashx` call guarded by a one-shot key found in that same script.
 *
 * Unpacking evaluates the packer's own return value: stripping the leading
 * `eval` turns the payload into an expression yielding the unpacked source as a
 * string rather than running it. The alternative is reimplementing the packer,
 * so `eval` stays, scoped to strings fetched from this one host.
 *
 * Three chapter shapes are handled in order: webtoon (URLs inline), paginated
 * (one request per page), and a markup fallback for plainly served chapters.
 */

/**
 * Reaching `eval` through a binding makes every call an indirect eval, which
 * runs in global scope and so cannot see this module's locals.
 */
// oxlint-disable-next-line no-eval -- see above; unpacking requires it
const globalEval: (source: string) => unknown = eval;

function unpack(script: string): string {
  return (globalEval(script.replace("eval", "")) as unknown as { toString(): string }).toString();
}

function packedScript($: CheerioAPI): string | undefined {
  return $("script:contains(function(p,a,c,k,e,d))").html() ?? undefined;
}

export async function extractChapterPages($: CheerioAPI, chapterUrl: string): Promise<string[]> {
  const pages = $("script[src*=chapter_bar]").length
    ? extractWebtoonPages($)
    : await extractPaginatedPages($, chapterUrl);

  return pages.length > 0 ? pages : extractFallbackPages($);
}

/** Webtoon chapters inline every URL in a `newImgs=[...]` array. */
function extractWebtoonPages($: CheerioAPI): string[] {
  const script = packedScript($);
  if (!script) return [];

  const urls = /newImgs=\['(.+?)'\]/.exec(unpack(script))?.[1];
  if (!urls) return [];

  return urls.split("','").map((url) => `https:${url.replace("'", "")}`);
}

/**
 * Paginated chapters expose one image per request, behind a single-use key: page
 * 1 consumes it, and later pages ride the session it establishes.
 */
async function extractPaginatedPages($: CheerioAPI, chapterUrl: string): Promise<string[]> {
  const script = packedScript($);
  if (!script) return [];

  const unpacked = unpack(script);

  // The key is the first quoted literal, before the first statement break.
  let secretKey = "";
  try {
    const keyExpression = unpacked.substring(unpacked.indexOf("'"), unpacked.indexOf(";")).trim();
    secretKey = (globalEval(keyExpression) as unknown as { toString(): string }).toString();
  } catch {
    return [];
  }

  const html = $.html();
  const chapterIdAt = html.indexOf("chapterid");
  if (chapterIdAt < 0) return [];

  // Skip past `chapterid=` to the numeric value terminated by `;`.
  const chapterId = html.substring(chapterIdAt + 11, html.indexOf(";", chapterIdAt)).trim();

  // The page count is the second-to-last pager entry; the last is "next".
  const pagerLinks = $("a", $(".pager-list-left > span").first());
  const pageCount = Number($(pagerLinks[pagerLinks.length - 2])?.attr("data-page")) || 0;
  if (pageCount <= 0) return [];

  const base = chapterUrl.substring(0, chapterUrl.lastIndexOf("/"));
  const pageUrl = (page: number, key: string) =>
    `${base}/chapterfun.ashx?cid=${chapterId}&page=${page}&key=${key}`;

  // Page 1 goes alone because it consumes the key; the rest depend only on the
  // session it opens, so they can be issued together.
  const first = await requestPagePayload(pageUrl(1, secretKey), chapterUrl);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      requestPagePayload(pageUrl(index + 2, ""), chapterUrl),
    ),
  );

  const pages: string[] = [];
  for (const body of [first, ...rest]) {
    if (!body) continue;

    // A page that fails to unpack is skipped rather than discarding the rest.
    const url = extractPageUrl(body);
    if (url) pages.push(url);
  }

  return pages;
}

/** The unpacked source assigns `pix=` (host path) and `pvalue=` (file name). */
function extractPageUrl(body: string): string | undefined {
  try {
    const unpacked = unpack(body);

    const hostAt = unpacked.indexOf("pix=") + 5;
    const host = unpacked.substring(hostAt, unpacked.indexOf(";", hostAt) - 1);

    const fileAt = unpacked.indexOf("pvalue=") + 9;
    const file = unpacked.substring(fileAt, unpacked.indexOf('"', fileAt));

    return `https:${host}${file}`;
  } catch {
    return undefined;
  }
}

/** Transient failures are common; this endpoint is rate-sensitive. */
async function requestPagePayload(url: string, referer: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [, buffer] = await Application.scheduleRequest({
        url,
        method: "GET",
        headers: {
          Referer: referer,
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const body = Application.arrayBufferToUTF8String(buffer);
      if (body) return body;
    } catch {
      continue;
    }
  }

  return undefined;
}

/** Some chapters are served as plain markup or an inline JSON blob. */
function extractFallbackPages($: CheerioAPI): string[] {
  const pages: string[] = [];

  $("img.img-fluid").each((_, element) => {
    const src = $(element).attr("src");
    if (src) pages.push(src);
  });

  if (pages.length > 0) return pages;

  $("script:not([src])").each((_, element) => {
    const text = $(element).html() ?? "";
    if (!text.includes('"images"') && !text.includes('"pages"')) return;

    const json = /(\{.*"images":\s*\[.*\].*\})/.exec(text)?.[1];
    if (!json) return;

    try {
      const parsed = JSON.parse(json) as { images?: (string | string[])[] };
      for (const image of parsed.images ?? []) {
        const url = Array.isArray(image) ? image[0] : image;
        if (url) pages.push(url);
      }
    } catch {}
  });

  return pages;
}
