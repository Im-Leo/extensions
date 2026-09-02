/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/**
 * The typed accessors every settings module shares.
 *
 * `Application.getState` returns `unknown`, so each read has to defend against a
 * value the store never held — a schema change, or a key written by an older
 * build — rather than trusting what comes back.
 */

/** Schema for the persisted thumbnail-quality keys; bump to discard old values. */
export const THUMBNAIL_QUALITY_SCHEMA = 1;

/** Returns a copy: callers that splice or push must not mutate persisted state. */
export function readStringArray(key: string, fallback: () => string[]): string[] {
  const stored = Application.getState(key) as unknown;
  return Array.isArray(stored) ? (stored as string[]).slice() : fallback();
}

export function getKey<T extends boolean | string | number>(key: string, defaultValue: T): T {
  const value = Application.getState(key);
  if (typeof value !== typeof defaultValue) return defaultValue;
  if (typeof defaultValue === "number" && !Number.isFinite(value)) return defaultValue;
  return value as T;
}
export function setKey<T>(key: string, value: T): void {
  Application.setState(value, key);
}
