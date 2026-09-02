/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/**
 * Hand-written markup carrying only what each selector reads. The three entries
 * differ in image attribute and href shape, so one fixture covers every branch
 * of the cover-URL resolver.
 */
export const LISTING_HTML = `
<html><body>
  <div class="list-comic-item-wrap">
    <a href="https://www.mangakakalot.gg/manga/alpha-title/"><img
      alt="Alpha Title" src="https://img.example.com/placeholder.gif"
      data-src="https://img-r1.2xstorage.com/thumb/alpha.webp"></a>
    <a class="list-story-item-wrap-chapter" href="#">Chapter 12</a>
  </div>
  <div class="list-comic-item-wrap">
    <a href="https://www.mangakakalot.gg/manga/beta-title"><img
      alt="Beta &amp; Friends" src="/uploads/beta.webp"></a>
    <a class="list-story-item-wrap-chapter" href="#">Chapter 3</a>
  </div>
  <div class="list-comic-item-wrap">
    <a href="https://www.mangakakalot.gg/manga/gamma-title/"><img
      alt="Gamma" src="http://img-r2.2xstorage.com/thumb/gamma.webp"></a>
    <a class="list-story-item-wrap-chapter" href="#">Chapter 1</a>
  </div>
  <div class="phantom-page">
    <span class="page-select">2</span><a class="page-last">LAST(7)</a>
  </div>
</body></html>`;

/** No pager at all: a result set that fits on one page. */
export const LISTING_SINGLE_PAGE_HTML = `
<html><body>
  <div class="list-comic-item-wrap">
    <a href="https://www.mangakakalot.gg/manga/solo/"><img alt="Solo" src="https://cdn.example.com/s.webp"></a>
  </div>
</body></html>`;

/** Current page equals last page, so paging must stop. */
export const LISTING_LAST_PAGE_HTML = `
<html><body>
  <span class="page-select">7</span><a class="page-last">LAST(7)</a>
</body></html>`;

/** An entry missing an id or title, which must be dropped rather than half-parsed. */
export const LISTING_WITH_INVALID_ENTRY_HTML = `
<html><body>
  <div class="list-comic-item-wrap">
    <a href="https://www.mangakakalot.gg/manga/valid-one/"><img alt="Valid One" src="https://cdn.example.com/v.webp"></a>
  </div>
  <div class="list-comic-item-wrap">
    <a href=""><img alt="" src=""></a>
  </div>
</body></html>`;

export const SEARCH_HTML = `
<html><body>
  <div class="story_item">
    <a href="https://www.mangakakalot.gg/manga/searched-title/"></a>
    <img alt="Searched Title" src="https://img-r1.2xstorage.com/thumb/searched.webp">
    <h3 class="story_name"><a href="#">Searched Title</a></h3>
    <em class="story_chapter"><a href="#">Chapter 44</a></em>
  </div>
</body></html>`;

/** Carries an adult genre, and an author cell whose nested label must not leak. */
export const DETAIL_HTML = `
<html><body>
  <div class="main-wrapper">
    <img alt="Detailed Title" src="https://imgs-2.2xstorage.com/thumb/detailed.webp">
    <h2 class="story-alternative">Alternative : Second Name; Third Name</h2>
    <div class="info-wrap">
      <!-- The label sits in a <p> and the value is loose text; the parser strips
           child <p> elements to isolate the value. -->
      <div><p>Author(s):</p>Some Author</div>
    </div>
    <ul>
      <li>Status : Completed</li>
      <li class="genres"><a href="/genre/action">Action</a><a href="/genre/smut">Smut</a></li>
    </ul>
    <div id="rate_row_cmd">rate : 8.5 / 10</div>
    <div id="contentBox">You are reading Detailed Title online, bookmark. A real synopsis follows.</div>
  </div>
</body></html>`;

/** The same shape without an adult genre, proving the rating is not hard-coded. */
export const DETAIL_SAFE_HTML = `
<html><body>
  <div class="main-wrapper">
    <img alt="Safe Title" src="https://imgs-2.2xstorage.com/thumb/safe.webp">
    <ul>
      <li>Status : Ongoing</li>
      <li class="genres"><a href="/genre/comedy">Comedy</a></li>
    </ul>
    <div id="rate_row_cmd">rate : 5 / 10</div>
    <div id="contentBox">A safe synopsis.</div>
  </div>
</body></html>`;

export const READER_HTML = `
<html><body>
  <div class="container-chapter-reader">
    <img src="https://img-r1.2xstorage.com/chapter/1.webp">
    <img data-src="https://img-r1.2xstorage.com/chapter/2.webp">
    <img src="">
  </div>
</body></html>`;

export const GENRES_HTML = `
<html><body>
  <div>
    <h3>GENRES</h3>
    <table><tr>
      <td><a href="/genre/action" title="Action">Action</a></td>
      <td><a href="/genre/comedy" title="Comedy">Comedy</a></td>
      <td><a href="/genre/" title="">Broken</a></td>
    </tr></table>
  </div>
</body></html>`;

export const CHAPTER_LIST_JSON = {
  success: true,
  data: {
    chapters: [
      {
        chapter_slug: "chapter-3",
        chapter_name: "Chapter 3",
        chapter_num: 3,
        updated_at: "2026-01-03T00:00:00Z",
      },
      {
        chapter_slug: "chapter-2",
        chapter_name: "Chapter 2",
        chapter_num: 2,
        updated_at: "2026-01-02T00:00:00Z",
      },
      {
        chapter_slug: "chapter-1",
        chapter_name: "Chapter 1",
        chapter_num: 1,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
};

/** `success: false` must yield no chapters rather than throwing. */
export const CHAPTER_LIST_FAILED_JSON = { success: false };
