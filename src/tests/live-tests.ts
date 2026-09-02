/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/**
 * Live tests reach the real sites: slow, dependent on someone else's data, and
 * unable to pass MangaKakalot's Cloudflare challenge from Node at all. They are
 * opt-in so `npm test` stays deterministic.
 *
 * The harness runs bundles in a `vm` context whose allowlist omits `process` but
 * passes the host `globalThis` through, so the flag is reachable only by that
 * indirection. Defaulting to false keeps the offline gate honest: a broken probe
 * disables live tests rather than silently skipping offline ones.
 */
export function liveTestsEnabled(): boolean {
  try {
    const host = globalThis as { process?: { env?: Record<string, string | undefined> } };
    return host.process?.env?.["PB_LIVE"] === "1";
  } catch {
    return false;
  }
}
