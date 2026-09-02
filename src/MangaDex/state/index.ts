/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/**
 * Persisted source settings, grouped by the area they configure.
 *
 * Re-exported from one place because consumers import settings by name, not by
 * area: `from "./state"` resolves here regardless of which module owns the key.
 */

export * from "./auth";
export * from "./blocking";
export * from "./content";
export * from "./discover";
export * from "./languages";
export * from "./reset";
export * from "./storage";
export * from "./thumbnails";
export * from "./updates";
