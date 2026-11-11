# Changelog

## Unreleased

### Fixed

- AsuraScans 1.1.1: opening a title or refreshing the library failed for some series. The series
  endpoint answers `{ series }` from its cache and `{ data: { series } }` on a cache miss; both
  shapes are now accepted.
- MangaFox 1.1.1: library items, Latest Updates and covers failed on iOS. The site now redirects
  slashless directory paths to plain http, which App Transport Security blocks, and serves cover
  URLs as http. Page URLs are now built in their canonical form and covers are upgraded to https.

### Changed

- MangaDex: the status label reads "Canceled". Comments, test names and docs use American English
  throughout.
