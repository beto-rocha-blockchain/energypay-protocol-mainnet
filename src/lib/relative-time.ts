import { useUiStore } from "@/store/ui";

/**
 * Language-aware relative timestamp, shared across the app.
 *
 * Reads the current language non-reactively (fine for timestamps — they refresh
 * with their data). Keeps the same compact shape in both languages:
 *   EN:  just now · 12s ago · 5m ago · 3h ago · 2d ago
 *   PT:  agora    · há 12s  · há 5 min · há 3 h · há 2 d
 */
export function relativeTime(iso: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";

  let lang: string;
  try {
    lang = useUiStore.getState().lang;
  } catch {
    lang = "en";
  }
  const pt = lang === "pt";

  const secs = Math.floor(ms / 1000);
  if (secs < 5) return pt ? "agora" : "just now";
  if (secs < 60) return pt ? `há ${secs}s` : `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return pt ? `há ${mins} min` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return pt ? `há ${hrs} h` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return pt ? `há ${days} d` : `${days}d ago`;
}
