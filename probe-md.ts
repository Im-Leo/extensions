const state = new Map<string, unknown>();
(globalThis as unknown as { Application: unknown }).Application = {
  async scheduleRequest(req: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }) {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    const buf = await res.arrayBuffer();
    return [{ status: res.status, headers: Object.fromEntries(res.headers) }, buf];
  },
  arrayBufferToUTF8String: (b: ArrayBuffer) => new TextDecoder().decode(b),
  getState: (k: string) => state.get(k),
  setState: (v: unknown, k: string) => {
    state.set(k, v);
  },
  getSecureState: (k: string) => state.get(k),
  setSecureState: (v: unknown, k: string) => {
    state.set(k, v);
  },
  getDefaultUserAgent: async () => "Paperback/0.9",
  registerInterceptor: () => {},
  Selector: () => {},
};

const { getChapters } = await import("./src/MangaDex/chapters.js");

// a manga the API definitely has chapters for
const id = process.argv[2] ?? "e5ce88e2-8c46-482d-8acf-5c6d5a64a585";
const sourceManga = {
  mangaId: id,
  mangaInfo: {
    primaryTitle: "probe",
    secondaryTitles: [],
    contentRating: "SAFE",
    additionalInfo: {},
  },
} as never;

try {
  const chapters = await getChapters(sourceManga);
  console.log("  chapters returned:", chapters.length);
  if (chapters[0]) console.log("  first:", chapters[0].chapterId, chapters[0].title ?? "");
} catch (e) {
  console.log("  THREW:", (e as Error).message.slice(0, 160));
}
