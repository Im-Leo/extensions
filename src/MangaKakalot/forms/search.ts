/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  AdvancedSearchForm,
  Section,
  SelectRow,
  type FormItemElement,
  type FormSectionElement,
  type SearchQuery,
  type TagSection,
} from "@paperback/types";

import type { SearchMetadata } from "../models";

/**
 * Genres are scraped from the homepage rather than hard-coded, so the option
 * list is supplied by the caller. One selection only: the site browses a genre
 * through /genre/<id> and offers no combined query.
 */
export class MangaKakalotAdvancedSearchForm extends AdvancedSearchForm {
  private readonly searchMetadata: SearchMetadata;
  private readonly genres: TagSection;

  constructor(searchQuery: SearchQuery<SearchMetadata>, genres: TagSection) {
    super();
    this.searchMetadata = searchQuery.metadata ?? {};
    this.genres = genres;
  }

  getSearchQueryMetadata(): SearchMetadata {
    return this.searchMetadata;
  }

  getSections(): FormSectionElement<unknown>[] {
    return [Section("genres", this.getGenreFilter())];
  }

  private getGenreFilter(): FormItemElement<unknown>[] {
    return [
      SelectRow("genres", {
        title: this.genres.title,
        subtitle: "The site browses one genre at a time",
        value: this.searchMetadata.genres ?? [],
        minItemCount: 0,
        maxItemCount: 1,
        options: this.genres.tags.map((tag) => ({ id: tag.id, title: tag.title })),
        onValueChange: Application.Selector(
          this as MangaKakalotAdvancedSearchForm,
          "handleGenresChange",
        ),
      }),
    ];
  }

  async handleGenresChange(value: string[]): Promise<void> {
    this.searchMetadata.genres = value;
  }
}
