/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

/**
 * Hand-written markup carrying only the elements each selector touches, so a
 * failure points at one selector rather than a whole page.
 */

/** The `manga-list-1` grid, behind Hot Release and New Manga. */
export const COMPACT_LISTING_HTML = `
<html><body>
  <div class="manga-list-1"><ul class="manga-list-1-list">
    <li>
      <a href="/manga/first_title/" title="First Title"></a>
      <img class="manga-list-1-cover" src="https://fmcdn.mfcdn.net/store/manga/1/cover.jpg?token=a">
      <p class="manga-list-1-item-subtitle">Ch.120</p>
    </li>
    <li>
      <a href="/manga/second_title/" title="Second Title"></a>
      <img class="manga-list-1-cover" src="https://fmcdn.mfcdn.net/store/manga/2/cover.jpg?token=b">
      <p class="manga-list-1-item-subtitle">Ch.7</p>
    </li>
  </ul></div>
  <div class="pager-list-left"><a href="/directory/4.html?news">&gt;</a></div>
</body></html>`;

/** The `manga-list-4` grid, behind Latest Updates and search. */
export const DETAILED_LISTING_HTML = `
<html><body>
  <div class="manga-list-4"><ul class="manga-list-4-list">
    <li>
      <p class="manga-list-4-item-title"><a href="/manga/third_title/" title="Third Title"></a></p>
      <img class="manga-list-4-cover" src="https://fmcdn.mfcdn.net/store/manga/3/cover.jpg?token=c">
      <ul class="manga-list-4-item-part"><li>Ch.55</li><li>ignored</li></ul>
    </li>
  </ul></div>
</body></html>`;

/** No cover: the parser requires all three fields, so the entry must be dropped. */
export const LISTING_MISSING_COVER_HTML = `
<html><body>
  <div class="manga-list-4"><ul class="manga-list-4-list">
    <li>
      <p class="manga-list-4-item-title"><a href="/manga/no_cover/" title="No Cover"></a></p>
      <img class="manga-list-4-cover" src="">
    </li>
  </ul></div>
</body></html>`;

/** A ">" link with no href, so pagination must fall back to page + 1. */
export const PAGER_WITHOUT_HREF_HTML = `
<html><body><div class="pager-list-left"><a>&gt;</a></div></body></html>`;

export const PAGER_ABSENT_HTML = `<html><body><div class="pager-list-left"></div></body></html>`;

/**
 * Tagged Comedy and Romance only, so a rating taken from the site's genre
 * catalogue rather than these tags fails: that catalogue always contains "Adult".
 */
export const DETAIL_SAFE_HTML = `
<html><body>
  <div class="detail-info-cover">
    <img class="detail-info-cover-img" src="https://fmcdn.mfcdn.net/store/manga/9/cover.jpg?token=z">
  </div>
  <div class="detail-info">
    <span class="detail-info-right-title-font">Safe Title</span>
    <span class="detail-info-right-title-tip">Ongoing</span>
    <span class="item-score">4,3</span>
    <p class="detail-info-right-say"><a href="/search?author=Someone">Someone</a></p>
    <div class="detail-info-right-tag-list">
      <a href="/directory/comedy/">Comedy</a>
      <a href="/directory/romance/">Romance</a>
    </div>
  </div>
  <p class="fullcontent">A safe synopsis.</p>
</body></html>`;

export const DETAIL_ADULT_HTML = DETAIL_SAFE_HTML.replace(
  '<a href="/directory/romance/">Romance</a>',
  '<a href="/directory/adult/">Adult</a>',
);

export const DETAIL_MATURE_HTML = DETAIL_SAFE_HTML.replace(
  '<a href="/directory/romance/">Romance</a>',
  '<a href="/directory/ecchi/">Ecchi</a>',
);

/**
 * The first entry has a dotted id, the shape that 404s because the site's
 * redirect reads ".1" as a file extension. Newest is listed first.
 */
export const CHAPTER_LIST_HTML = `
<html><body>
  <div id="chapterlist"><ul>
    <li><a href="/manga/sword_king/c003/1.html"><p class="title2">3 days ago</p></a></li>
    <li><a href="/manga/sword_king/c002/1.html"><p class="title2">Yesterday</p></a></li>
    <li><a href="/manga/sword_king/c001.1/1.html"><p class="title2">2 weeks ago</p></a></li>
  </ul></div>
</body></html>`;
