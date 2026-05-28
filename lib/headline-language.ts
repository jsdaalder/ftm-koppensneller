export type HeadlineLanguage = "nl" | "en";

export const HEADLINE_LANGUAGE_PARAM = "headline_language";
export const HEADLINE_LANGUAGE_STORAGE_KEY = "ftm_headline_language";

export function isHeadlineLanguage(input: string | null | undefined): input is HeadlineLanguage {
  return input === "nl" || input === "en";
}

export function readHeadlineLanguageFromStorage(): HeadlineLanguage | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(HEADLINE_LANGUAGE_STORAGE_KEY);
  return isHeadlineLanguage(raw) ? raw : null;
}

export function writeHeadlineLanguageToStorage(value: HeadlineLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HEADLINE_LANGUAGE_STORAGE_KEY, value);
}

export function readHeadlineLanguageFromUrl(url: URL): HeadlineLanguage | null {
  const raw = url.searchParams.get(HEADLINE_LANGUAGE_PARAM);
  return isHeadlineLanguage(raw) ? raw : null;
}
