/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { ScanlationGroupItem } from "../models";
import { getKey, readStringArray, setKey } from "./storage";

/** Scanlation groups and uploaders whose chapters are hidden. */

export function getBlockedGroups(): Record<string, ScanlationGroupItem> {
  const stored = Application.getState("blocked_groups") as unknown;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }
  return { ...(stored as Record<string, ScanlationGroupItem>) };
}

export const saveBlockedGroups = (v: Record<string, ScanlationGroupItem>): void =>
  setKey("blocked_groups", v);
export const getGroupBlockingEnabled = (): boolean => getKey("group_blocking_enabled", false);
export const setGroupBlockingEnabled = (v: boolean): void => setKey("group_blocking_enabled", v);
export const getFuzzyBlockingEnabled = (): boolean => getKey("fuzzy_blocking_enabled", false);
export const setFuzzyBlockingEnabled = (v: boolean): void => setKey("fuzzy_blocking_enabled", v);
export const getBlockedUploaders = (): string[] => readStringArray("blocked_uploaders", () => []);
export const setBlockedUploaders = (v: string[]): void => setKey("blocked_uploaders", v);
