/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

/**
 * Request helpers shared by the scraped sources.
 *
 * All three wrap the same primitive and differ only in how the body is read.
 * Going through `Application.scheduleRequest` is the point: it is the only path
 * that passes registered interceptors, so a source's `Referer` and rate limit
 * apply to every call made here.
 */

export async function fetchText(url: string): Promise<string> {
  const [, buffer] = await Application.scheduleRequest({ url, method: "GET" });
  return Application.arrayBufferToUTF8String(buffer);
}

export async function fetchCheerio(url: string): Promise<CheerioAPI> {
  return cheerio.load(await fetchText(url));
}

/**
 * Undefined rather than a throw when the body is not JSON, for callers treating
 * an unparseable response as "no data". Use {@link fetchText} to tell the
 * failure modes apart.
 */
export async function fetchJSON<T>(url: string): Promise<T | undefined> {
  const body = await fetchText(url);

  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined;
  }
}
