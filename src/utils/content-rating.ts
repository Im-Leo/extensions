/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { ContentRating } from "@paperback/types";

/**
 * Content-rating classification, shared so every source answers the question the
 * same way.
 *
 * A rating is derived from the genres of the title in hand. Neither a
 * source-level constant nor a site's genre catalogue substitutes: the first
 * asserts a rating the app cannot second-guess, the second describes the site
 * rather than the title. Matching is case-insensitive over one vocabulary
 * because sites disagree on casing and spelling.
 */

/**
 * Explicit sexual content.
 *
 * Both the display name and the URL slug of a genre end up here, so entries are
 * written in the normalised form {@link normalize} produces.
 */
const ADULT_GENRES = new Set([
  "adult",
  "erotica",
  "fetish",
  "hentai",
  "incest",
  "loli",
  "lolicon",
  "netorare",
  "netori",
  "pornographic",
  "r 18",
  "shota",
  "shotacon",
  "sm bdsm",
  "smut",
]);

/**
 * Suggestive or explicit-adjacent, but not explicit.
 *
 * Deliberately narrow. Broad descriptive tags — "violence", "bloody",
 * "suggestive" — appear on a large share of ordinary action titles, so treating
 * them as mature masks a library rather than the handful of covers worth hiding.
 */
const MATURE_GENRES = new Set(["ecchi", "gore", "mature", "sexual violence", "yaoi", "yuri"]);

/**
 * Folds a genre to one comparable form.
 *
 * Sites name the same genre two ways and both reach this module: a detail page
 * gives the display name ("Sexual Violence") while browsing gives the URL slug
 * ("sexual-violence"). Separators collapse to a single space so either matches.
 */
function normalize(genre: string): string {
  return genre.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

/**
 * What a tile reports when the site exposes no genres for it.
 *
 * Never `EVERYONE`: an unknown tile that reads as safe is the outcome this
 * classification exists to prevent. Opening the title replaces it with the real
 * rating, so the cost of being wrong here is a blurred safe cover.
 */
export const UNRATED_LISTING_DEFAULT = ContentRating.MATURE;

/** An unrecognised genre yields `EVERYONE`, so a new one cannot start hiding titles. */
export function rateContent(genres: Iterable<string> | undefined): ContentRating {
  if (!genres) return ContentRating.EVERYONE;

  let rating = ContentRating.EVERYONE;
  for (const genre of genres) {
    const normalized = normalize(genre);
    // ADULT is terminal; a MATURE hit keeps scanning in case an adult genre follows.
    if (ADULT_GENRES.has(normalized)) return ContentRating.ADULT;
    if (MATURE_GENRES.has(normalized)) rating = ContentRating.MATURE;
  }

  return rating;
}

/**
 * How many learned ratings survive a restart.
 *
 * Bounded because this lands in the source's persisted state: a reader who
 * browses for months would otherwise grow it without limit.
 */
const PERSISTED_RATING_LIMIT = 2000;

/**
 * Where a persisted cache reads and writes.
 *
 * Injectable because `Application` is a sandbox global the test runner does not
 * expose — passing the store in is what makes persistence testable at all.
 */
export interface RatingStore {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
}

const applicationStore: RatingStore = {
  read: (key) => Application.getState(key),
  write: (key, value) => Application.setState(value, key),
};

/**
 * Ratings learned from detail pages, reused by later listings.
 *
 * Scoped per extension, since bundles share no runtime. Unbounded, because a
 * browsing session cannot realistically reach more than a few hundred titles.
 */
export class ContentRatingCache {
  private readonly ratings = new Map<string, ContentRating>();
  private loaded = false;
  private dirty = false;

  /**
   * @param storageKey persists the cache under this key. Without one the cache
   * lives for the session only, which is right for a source whose listings carry
   * genres and so never pay to resolve them.
   */
  constructor(
    private readonly storageKey?: string,
    private readonly store: RatingStore = applicationStore,
  ) {}

  remember(mangaId: string, rating: ContentRating): void {
    if (!mangaId) return;
    this.load();
    this.ratings.set(mangaId, rating);
    this.dirty = true;
  }

  knows(mangaId: string): boolean {
    this.load();
    return this.ratings.has(mangaId);
  }

  /** The learned rating, or `fallback` for a title never opened. */
  recall(mangaId: string, fallback: ContentRating = UNRATED_LISTING_DEFAULT): ContentRating {
    this.load();
    return this.ratings.get(mangaId) ?? fallback;
  }

  /**
   * Writes the cache back, if it is persisted and has changed.
   *
   * Called once a batch of lookups finishes rather than per title: a listing
   * page resolves two dozen ratings, and each would otherwise be its own write.
   */
  flush(): void {
    if (!this.storageKey || !this.dirty) return;
    this.dirty = false;

    // Oldest entries go first; Map preserves insertion order.
    const entries = [...this.ratings.entries()].slice(-PERSISTED_RATING_LIMIT);
    this.store.write(this.storageKey, Object.fromEntries(entries));
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.storageKey) return;

    const stored = this.store.read(this.storageKey);
    if (!stored || typeof stored !== "object") return;

    for (const [mangaId, rating] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof rating === "string") this.ratings.set(mangaId, rating as ContentRating);
    }
  }
}

/**
 * Detail requests allowed in flight at once.
 *
 * A source's rate limiter caps requests per second but not how many are
 * outstanding. Unbounded, a listing opens one connection per tile and the origin
 * answers with 5xx.
 */
const RESOLUTION_CONCURRENCY = 8;

/**
 * Resolves the rating of every tile the cache cannot already answer for.
 *
 * `learn` reads one title's detail page — normally the source's
 * `getMangaDetails`, whose parser fills the cache as a side effect.
 */
export async function learnMissingRatings(
  mangaIds: readonly string[],
  cache: ContentRatingCache,
  learn: (mangaId: string) => Promise<unknown>,
  concurrency: number = RESOLUTION_CONCURRENCY,
): Promise<void> {
  const unknown = [...new Set(mangaIds)].filter((id) => id !== "" && !cache.knows(id));

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < unknown.length) {
      const id = unknown[next++];
      if (id === undefined) return;

      try {
        await learn(id);
      } catch {
        // One unreadable title keeps the default rather than emptying the grid.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, unknown.length)) }, worker),
  );

  cache.flush();
}
