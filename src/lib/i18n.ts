/**
 * Lightweight i18n. The whole app is authored in English; PT translations live in
 * i18n-dict.ts keyed by the English source string. useT() returns a translator
 * that localizes a source string (falling back to English when no entry exists),
 * so partial coverage degrades gracefully and never breaks a screen.
 */
import { useUiStore } from "@/store/ui";
import { PT } from "./i18n-dict";

/** Translator hook: const t = useT(); ... t("Some English string"). */
export function useT() {
  const lang = useUiStore((s) => s.lang);
  return (s: string): string => (lang === "pt" ? PT[s] ?? s : s);
}

/** Current language + setter, for toggles. */
export function useLang() {
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  return { lang, setLang };
}
