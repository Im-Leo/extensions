/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { ButtonRow, LabelRow, type FormItemElement } from "@paperback/types";

export function bindMoveHandlers(
  form: object,
  count: number,
  onMove: (from: number, to: number) => Promise<void> | void,
): void {
  for (let i = 0; i < count; i++) {
    (form as Record<string, unknown>)[`moveUp_${i}`] = async (): Promise<void> => {
      await onMove(i, i - 1);
    };
    (form as Record<string, unknown>)[`moveDown_${i}`] = async (): Promise<void> => {
      await onMove(i, i + 1);
    };
  }
}

export function buildReorderableRows(
  form: object,
  items: readonly string[],
  labelFor: (item: string, index: number) => string,
  moveLabelFor: (item: string) => string,
): FormItemElement<unknown>[] {
  const rows: FormItemElement<unknown>[] = [];

  for (const [i, item] of items.entries()) {
    rows.push(LabelRow(`section_${i}`, { title: labelFor(item, i) }));

    if (i > 0) {
      rows.push(
        ButtonRow(`move_up_${i}`, {
          title: `↑ ${moveLabelFor(item)}`,
          onSelect: Application.Selector(form as never, `moveUp_${i}` as never),
        }),
      );
    }

    if (i < items.length - 1) {
      rows.push(
        ButtonRow(`move_down_${i}`, {
          title: `↓ ${moveLabelFor(item)}`,
          onSelect: Application.Selector(form as never, `moveDown_${i}` as never),
        }),
      );
    }
  }

  return rows;
}

/** Null when either index is out of range; the caller leaves the order untouched. */
export function swapItems<T>(items: readonly T[], from: number, to: number): T[] | null {
  // Explicit bounds rather than `at()`, which reads a negative index from the end.
  const inRange = (index: number) => index >= 0 && index < items.length;
  if (!inRange(from) || !inRange(to)) return null;

  const source = items[from];
  const target = items[to];
  if (source === undefined || target === undefined) return null;

  const next = items.slice();
  next[from] = target;
  next[to] = source;

  return next;
}
