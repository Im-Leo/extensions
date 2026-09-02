/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  AdvancedSearchForm,
  Section,
  SelectRow,
  type FormItemElement,
  type FormSectionElement,
  type SearchQuery,
} from "@paperback/types";

import { GENRES, type SearchMetadata } from "../models";

/**
 * One genre, and nothing else: the site appends a single `?genres=` id, supports
 * no exclusions and has no multi-genre endpoint, so the form offers no control
 * the request could not honour.
 */
export class MangaFoxAdvancedSearchForm extends AdvancedSearchForm {
  private readonly searchMetadata: SearchMetadata;

  constructor(searchQuery: SearchQuery<SearchMetadata>) {
    super();
    this.searchMetadata = searchQuery.metadata ?? {};
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
        title: "Genre",
        subtitle: "The site searches one genre at a time",
        value: this.searchMetadata.genres ?? [],
        minItemCount: 0,
        maxItemCount: 1,
        options: GENRES.map((genre) => ({ id: genre.id, title: genre.title })),
        onValueChange: Application.Selector(
          this as MangaFoxAdvancedSearchForm,
          "handleGenresChange",
        ),
      }),
    ];
  }

  async handleGenresChange(value: string[]): Promise<void> {
    this.searchMetadata.genres = value;
  }
}
