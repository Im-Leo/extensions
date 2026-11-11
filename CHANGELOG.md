# Changelog

## Unreleased

### Fixed

- AsuraScans 1.1.1: opening a title or refreshing the library failed for some series. The series
  endpoint answers `{ series }` from its cache and `{ data: { series } }` on a cache miss; both
  shapes are now accepted.
