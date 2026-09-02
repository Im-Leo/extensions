/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

interface Language {
  name: string;
  MDCode: string;
  flagCode: string;
  default?: boolean;
}

class MDLanguagesClass {
  // `MDCode` is the ISO 639 code; `name` is the language's own endonym.
  Languages: Language[] = [
    {
      name: "اَلْعَرَبِيَّةُ",
      MDCode: "ar",
      flagCode: "🇦🇪",
    },
    {
      name: "български",
      MDCode: "bg",
      flagCode: "🇧🇬",
    },
    {
      name: "বাংলা",
      MDCode: "bn",
      flagCode: "🇧🇩",
    },
    {
      name: "Català",
      MDCode: "ca",
      flagCode: "🇪🇸",
    },
    {
      name: "Čeština",
      MDCode: "cs",
      flagCode: "🇨🇿",
    },
    {
      name: "Dansk",
      MDCode: "da",
      flagCode: "🇩🇰",
    },
    {
      name: "Deutsch",
      MDCode: "de",
      flagCode: "🇩🇪",
    },
    {
      name: "English",
      MDCode: "en",
      flagCode: "🇬🇧",
      default: true,
    },
    {
      name: "Español",
      MDCode: "es",
      flagCode: "🇪🇸",
    },
    {
      name: "Español (Latinoamérica)",
      MDCode: "es-la",
      flagCode: "🇪🇸",
    },
    {
      name: "فارسی",
      MDCode: "fa",
      flagCode: "🇮🇷",
    },
    {
      name: "Suomi",
      MDCode: "fi",
      flagCode: "🇫🇮",
    },
    {
      name: "Français",
      MDCode: "fr",
      flagCode: "🇫🇷",
    },
    {
      name: "עִבְרִית",
      MDCode: "he",
      flagCode: "🇮🇱",
    },
    {
      name: "हिन्दी",
      MDCode: "hi",
      flagCode: "🇮🇳",
    },
    {
      name: "Magyar",
      MDCode: "hu",
      flagCode: "🇭🇺",
    },
    {
      name: "Indonesia",
      MDCode: "id",
      flagCode: "🇮🇩",
    },
    {
      name: "Italiano",
      MDCode: "it",
      flagCode: "🇮🇹",
    },
    {
      name: "日本語",
      MDCode: "ja",
      flagCode: "🇯🇵",
    },
    {
      name: "한국어",
      MDCode: "ko",
      flagCode: "🇰🇷",
    },
    {
      name: "Lietuvių",
      MDCode: "lt",
      flagCode: "🇱🇹",
    },
    {
      name: "монгол",
      MDCode: "mn",
      flagCode: "🇲🇳",
    },
    {
      name: "Melayu",
      MDCode: "ms",
      flagCode: "🇲🇾",
    },
    {
      name: "မြန်မာဘာသာ",
      MDCode: "my",
      flagCode: "🇲🇲",
    },
    {
      name: "Nederlands",
      MDCode: "nl",
      flagCode: "🇳🇱",
    },
    {
      name: "Norsk",
      MDCode: "no",
      flagCode: "🇳🇴",
    },
    {
      name: "Polski",
      MDCode: "pl",
      flagCode: "🇵🇱",
    },
    {
      name: "Português",
      MDCode: "pt",
      flagCode: "🇵🇹",
    },
    {
      name: "Português (Brasil)",
      MDCode: "pt-br",
      flagCode: "🇧🇷",
    },
    {
      name: "Română",
      MDCode: "ro",
      flagCode: "🇷🇴",
    },
    {
      name: "Русский",
      MDCode: "ru",
      flagCode: "🇷🇺",
    },
    {
      name: "Српски",
      MDCode: "sr",
      flagCode: "🇷🇸",
    },
    {
      name: "Svenska",
      MDCode: "sv",
      flagCode: "🇸🇪",
    },
    {
      name: "ไทย",
      MDCode: "th",
      flagCode: "🇹🇭",
    },
    {
      name: "Filipino",
      MDCode: "tl",
      flagCode: "🇵🇭",
    },
    {
      name: "Türkçe",
      MDCode: "tr",
      flagCode: "🇹🇷",
    },
    {
      name: "Українська",
      MDCode: "uk",
      flagCode: "🇺🇦",
    },
    {
      name: "Tiếng Việt",
      MDCode: "vi",
      flagCode: "🇻🇳",
    },
    {
      name: "中文 (简化字)",
      MDCode: "zh",
      flagCode: "🇨🇳",
    },
    {
      name: "中文 (繁體字)",
      MDCode: "zh-hk",
      flagCode: "🇭🇰",
    },
  ];

  // Indexed for O(1) lookup: getName and getFlagCode run once per chapter inside
  // 500-chapter feed loops.
  private byCode: Map<string, Language>;

  constructor() {
    this.Languages.sort((a, b) => a.name.localeCompare(b.name));
    this.byCode = new Map(this.Languages.map((l) => [l.MDCode, l]));
  }

  getMDCodeList(): string[] {
    return this.Languages.map((Language) => Language.MDCode);
  }

  getName(MDCode: string): string {
    return this.byCode.get(MDCode)?.name ?? "Unknown";
  }

  getFlagCode(MDCode: string): string {
    return this.byCode.get(MDCode)?.flagCode ?? "_unknown";
  }

  getDefault(): string[] {
    return this.Languages.filter((Language) => Language.default).map((Language) => Language.MDCode);
  }
}

export const MDLanguages = new MDLanguagesClass();
