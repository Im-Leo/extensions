/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

export type QueryValue = string | number | boolean | string[] | object;

/**
 * How a repeated value is encoded. AsuraScans' listing endpoints expect bare
 * repeated keys (`genres=a&genres=b`); its bookmark endpoints expect PHP-style
 * brackets (`ids[]=a&ids[]=b`).
 */
export type ArrayQueryStyle = "bracket" | "repeat";

class URLBuilder {
  private readonly baseUrl: string;
  private readonly arrayStyle: ArrayQueryStyle;
  private queryParams: Record<string, QueryValue> = {};
  private pathSegments: string[] = [];

  constructor(baseUrl: string, arrayStyle: ArrayQueryStyle = "bracket") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.arrayStyle = arrayStyle;
  }

  addPath(segment: string): this {
    this.pathSegments.push(segment.replace(/^\/+|\/+$/g, ""));
    return this;
  }

  addQuery(key: string, value: QueryValue): this {
    this.queryParams[key] = value;
    return this;
  }

  reset(): this {
    this.queryParams = {};
    this.pathSegments = [];
    return this;
  }

  build(): string {
    const path = this.pathSegments.length > 0 ? `/${this.pathSegments.join("/")}` : "";
    const query = this.formatQuery();

    return query.length > 0 ? `${this.baseUrl}${path}?${query}` : `${this.baseUrl}${path}`;
  }

  /** Values are interpolated verbatim; callers encode anything free-text themselves. */
  private formatQuery(): string {
    return Object.entries(this.queryParams)
      .flatMap(([key, value]) => {
        if (Array.isArray(value)) return this.formatArray(key, value);
        if (typeof value === "object") return formatObject(key, value);

        // An empty value means "unset", not an empty parameter.
        return value === "" ? [] : [`${key}=${value}`];
      })
      .join("&");
  }

  private formatArray(key: string, values: string[]): string[] {
    const suffix = this.arrayStyle === "repeat" ? "" : "[]";
    return values.map((value) => `${key}${suffix}=${value}`);
  }
}

function formatObject(key: string, value: object): string[] {
  return Object.entries(value)
    .map(([field, fieldValue]) =>
      fieldValue !== undefined ? `${key}[${field}]=${fieldValue}` : undefined,
    )
    .filter((entry) => entry !== undefined);
}

export { URLBuilder };
