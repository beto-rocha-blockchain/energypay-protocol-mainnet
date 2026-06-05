import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useUiStore } from "@/store/ui";
import { BrandBadge, BrandName } from "@/components/BrandLogo";

/**
 * Language chooser. Two behaviours:
 *
 *  • On the public LANDING page (`/landing`) — the link used to promote the
 *    platform — every fresh load must pick a language, so the chooser always
 *    appears until the visitor selects one (then hides for that visit).
 *  • Everywhere else it only appears until a language has ever been chosen
 *    (persisted), so returning/authenticated users are not re-prompted.
 *
 * Renders nothing on the server / first paint, so there is no hydration flash.
 */
export function LanguageGate() {
  const langChosen = useUiStore((s) => s.langChosen);
  const setLang = useUiStore((s) => s.setLang);
  const hydrateLang = useUiStore((s) => s.hydrateLang);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    hydrateLang();
    setReady(true);
  }, [hydrateLang]);

  const isLanding = pathname === "/landing";
  if (!ready || dismissed || (!isLanding && langChosen)) return null;

  const choose = (l: "en" | "pt") => {
    setLang(l);
    setDismissed(true);
  };

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
            onClick={() => choose("pt")}
            className="w-full rounded-md border border-border bg-background/40 px-4 py-3 text-sm font-medium transition hover:border-primary/60 hover:bg-primary/10"
          >
            🇧🇷 Português
          </button>
          <button
            type="button"
            onClick={() => choose("en")}
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
