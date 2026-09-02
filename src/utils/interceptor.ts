/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  CloudflareError,
  PaperbackInterceptor,
  type Cookie,
  type CookieStorageInterceptor,
  type Request,
  type Response,
} from "@paperback/types";

/**
 * One clearance issues several cookies — `cf_clearance`, `__cf_bm`, `_cfuvid`,
 * `cf_chl_*` — and persisting only the named one loses the session.
 */
const CLOUDFLARE_COOKIE = /^_{0,2}cf/i;

/** 2xx, plus the 304 a conditional request earns when the cached copy still stands. */
function isSuccess(status: number): boolean {
  return (status >= 200 && status < 300) || status === 304;
}

const IMAGE_PATH = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;

function isImageRequest(url: string): boolean {
  return IMAGE_PATH.test(url);
}

/**
 * The device user agent, resolved once.
 *
 * `interceptRequest` runs for every request a source makes, and a library grid
 * issues one per cover at the same moment. Asking the runtime each time turns a
 * constant into per-image async work.
 */
let cachedUserAgent: string | undefined;

async function userAgent(): Promise<string> {
  cachedUserAgent ??= await Application.getDefaultUserAgent();
  return cachedUserAgent;
}

export interface SiteInterceptorOptions {
  /** Sets the `Referer` header, and the challenge target unless overridden. */
  domain: string;

  /** Page to load to solve a challenge, where the domain root will not do. */
  bypassPage?: string;

  /**
   * Reject unsuccessful responses. Needed by sites answering a bad path with an
   * error page that still parses, which otherwise surfaces as empty content
   * rather than as a failure.
   */
  requireOk?: boolean;

  /**
   * Flat name -> value map. A `{ name, value, domain }` object also satisfies
   * `Record<string, string>` and silently sets three junk cookies.
   */
  cookies?: Record<string, string>;
}

/**
 * The request handling every source needs: a `Referer` its image CDN accepts, a
 * real user agent, and Cloudflare challenge detection.
 *
 * Sources differ only in policy, so the differences are options rather than
 * subclasses. Detection is safe everywhere — a site that never challenges never
 * triggers it.
 */
export class SiteInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private readonly options: SiteInterceptorOptions,
  ) {
    super(id);
  }

  override async interceptRequest(request: Request): Promise<Request> {
    return {
      ...request,
      headers: {
        ...request.headers,
        // Image CDNs commonly 403 a request with no Referer, which surfaces as
        // missing covers while page scraping continues to work.
        referer: `${this.options.domain}/`,
        "user-agent": await userAgent(),
      },
      cookies: { ...request.cookies, ...this.options.cookies },
    };
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.headers?.["cf-mitigated"] === "challenge") {
      const domain = this.options.domain;

      throw new CloudflareError(
        {
          url: this.options.bypassPage ?? domain,
          method: "GET",
          headers: {
            referer: `${domain}/`,
            origin: `${domain}/`,
            "user-agent": await Application.getDefaultUserAgent(),
          },
        },
        "Cloudflare detected, bypass it to continue!",
      );
    }

    // Only page requests. `requireOk` exists to catch an error page that still
    // parses, and an image that fails should leave a blank cover rather than
    // throw an error through a grid of them.
    if (this.options.requireOk && !isImageRequest(request.url) && !isSuccess(response.status)) {
      throw new Error(`Request failed with status ${response.status}: ${request.url}`);
    }

    return data;
  }
}

/** Stores a solved challenge's cookies so it survives an app restart. */
export function persistCloudflareCookies(
  cookies: Cookie[],
  storage: CookieStorageInterceptor,
): void {
  for (const cookie of cookies) {
    if (CLOUDFLARE_COOKIE.test(cookie.name)) storage.setCookie(cookie);
  }
}
