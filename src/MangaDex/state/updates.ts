/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { getKey, readStringArray, setKey } from "./storage";

/** How the library update flow batches work and which titles it skips. */

export function getUpdateBatchSize(): number {
  const stored = Application.getState("update_batch_size") as unknown;
  if (typeof stored !== "number" || !Number.isInteger(stored) || stored < 1) return 100;
  return Math.min(stored, 100);
}

export function setUpdateBatchSize(size: number): void {
  const clamped = !Number.isInteger(size) || size < 1 ? 100 : Math.min(size, 100);
  Application.setState(clamped, "update_batch_size");
}

export const getOptimizeUpdates = (): boolean => getKey("optimize_updates", true);
export const setOptimizeUpdates = (v: boolean): void => setKey("optimize_updates", v);
export const getMetadataUpdater = (): boolean => getKey("metadata_updater", false);
export const setMetadataUpdater = (v: boolean): void => setKey("metadata_updater", v);
export const getSkipPublicationStatus = (): string[] =>
  readStringArray("skip_publication_status", () => []);
export const setSkipPublicationStatus = (v: string[]): void => setKey("skip_publication_status", v);
export const getSkipNewChapters = (): number => getKey("skip_new_chapters", 0);
export const setSkipNewChapters = (v: number): void => setKey("skip_new_chapters", v);
export const getSkipUnreadChapters = (): number => getKey("skip_unread_chapters", 0);
export const setSkipUnreadChapters = (v: number): void => setKey("skip_unread_chapters", v);
