import { useUiStore } from "@/store/ui";

/**
 * Compact EN/PT switch. Shows the language you'd switch TO. Persists the choice.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const next = lang === "pt" ? "en" : "pt";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={lang === "pt" ? "Switch to English" : "Mudar para Português"}
      className={
        className ??
        "flex items-center gap-1.5 font-mono uppercase tracking-widest text-muted-foreground transition hover:text-primary"
      }
    >
      {lang === "pt" ? "EN" : "PT"}
    </button>
  );
}
