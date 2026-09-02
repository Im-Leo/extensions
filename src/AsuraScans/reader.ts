/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { PageData } from "./models";

/** Supplied by the Paperback runtime, not importable; only the members used here. */
declare class CanvasAPI {
  constructor(width: number, height: number);
  getContext(contextId: "2d"): CanvasRenderingContext2D;
  toDataURL(): string;
}

/**
 * Reassembles a page the site ships as a shuffled tile grid.
 *
 * The image is cut into `tile_cols * tile_rows` cells and `tiles[origin]` gives
 * the destination of each one, so the original can only be recovered
 * client-side: fetch the page, redraw every tile onto a canvas, return a data
 * URI. Pages without a tile map are already in order and pass straight through.
 */
export async function descramblePage(page: PageData): Promise<string> {
  if (!page.url || !page.tiles || !page.tile_cols || !page.tile_rows) return page.url;

  const [response, buffer] = await Application.scheduleRequest({ url: page.url, method: "GET" });
  const contentType = response.headers["Content-Type"] ?? "image/jpeg";
  // Typed as string | ArrayBuffer; the runtime returns base64 text for a buffer.
  const encoded = Application.base64Encode(buffer) as string;
  const source = `data:${contentType};base64,${encoded}`;

  return new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = new CanvasAPI(image.width, image.height);
      const context = canvas.getContext("2d");

      const tileWidth = image.width / page.tile_cols;
      const tileHeight = image.height / page.tile_rows;

      page.tiles.forEach((destination, origin) => {
        const sx = (origin % page.tile_cols) * tileWidth;
        const sy = Math.floor(origin / page.tile_cols) * tileHeight;
        const dx = (destination % page.tile_cols) * tileWidth;
        const dy = Math.floor(destination / page.tile_cols) * tileHeight;

        context.drawImage(image, sx, sy, tileWidth, tileHeight, dx, dy, tileWidth, tileHeight);
      });

      resolve(canvas.toDataURL());
    };

    image.onerror = () => reject(new Error(`Failed to load page for unscrambling: ${page.url}`));
    image.src = source;
  });
}
