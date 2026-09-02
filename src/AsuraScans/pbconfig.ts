/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "Asura Scans",
  description: "Extension that pulls content from asurascans.com.",
  version: "1.1.0",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.PROGRESS_PROVIDING,
  ],
  badges: [],
  developers: [{ name: "Im-Leo", github: "https://github.com/Im-Leo" }],
} satisfies ExtensionInfo;
