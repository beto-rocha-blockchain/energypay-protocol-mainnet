import { useEffect, useState } from "react";
import { useUiStore } from "@/store/ui";
import { BrandBadge, BrandName } from "@/components/BrandLogo";

/**
 * First-visit language chooser. On mount it hydrates the stored/detected language;
 * if the user has never explicitly chosen, it overlays a full-screen picker so the
 * visitor selects their experience up front. Renders nothing once a choice exists
 * (and nothing on the server / first paint, so there is no hydration flash).
 */
export function LanguageGate() {
  const langChosen = useUiStore((s) => s.langChosen);
  const setLang = useUiStore((s) => s.setLang);
  const hydrateLang = useUiStore((s) => s.hydrateLang);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateLang();
    setReady(true);
  }, [hydrateLang]);

  if (!ready || langChosen) return null;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-background/95 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-2xl">
        <div className="flex items-center justify-center gap-2">
          <BrandBadge size="md" />
          <BrandName size="md" />
        </div>
        <h2 className="mt-5 font-display text-lg font-semibold">Choose your language</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Escolha seu idioma</p>
        <div className="mt-6 grid gap-2.5">
          <button
            type="button"
            onClick={() => setLang("pt")}
            className="w-full rounded-md border border-border bg-background/40 px-4 py-3 text-sm font-medium transition hover:border-primary/60 hover:bg-primary/10"
          >
            🇧🇷 Português
          </button>
          <button
            type="button"
            onClick={() => setLang("en")}
            className="w-full rounded-md border border-border bg-background/40 px-4 py-3 text-sm font-medium transition hover:border-primary/60 hover:bg-primary/10"
          >
            🇺🇸 English
          </button>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          You can switch anytime · Você pode trocar quando quiser
        </p>
      </div>
    </div>
  );
}
