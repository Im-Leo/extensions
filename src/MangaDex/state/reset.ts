/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/**
 * Restoring defaults.
 *
 * Every persisted key is listed explicitly rather than derived, because
 * `Application` exposes no way to enumerate what a source has written — a key
 * missing from this list survives a reset silently.
 */

const SETTINGS_KEYS: readonly string[] = [
  "discover_section_order",
  "popular_enabled",
  "latest_updates_enabled",
  "recommended_enabled",
  "self_published_enabled",
  "seasonal_enabled",
  "recently_added_enabled",
  "languages",
  "language_priority",
  "romanized_priority_enabled",
  "native_title_display",
  "ratings",
  "data_saver",
  "force_port_443",
  "skip_same_chapter",
  "include_unavailable",

  "show_alt_titles_in_synopsis",
  "show_final_chapter_in_synopsis",
  "try_first_volume_cover",
  "discover_thumbnail",
  "search_thumbnail",
  "manga_thumbnail",
  "show_status_icons",
  "show_content_rating_icons",
  "show_volume_in_subtitle",
  "show_chapter_in_subtitle",
  "show_search_rating_subtitle",
  "relevance_scoring_enabled",
  "blocked_groups",
  "group_blocking_enabled",
  "fuzzy_blocking_enabled",
  "blocked_uploaders",
  "update_batch_size",
  "optimize_updates",
  "metadata_updater",
  "skip_publication_status",
  "skip_new_chapters",
  "skip_unread_chapters",
];

export function resetAllSettings(): void {
  for (const key of SETTINGS_KEYS) {
    Application.setState(undefined, key);
  }
}
