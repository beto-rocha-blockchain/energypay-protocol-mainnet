/**
 * UI-only Zustand stores. These hold UI ephemeral state (selection,
 * density, sidebar) and live-channel health telemetry — NOT data.
 * Data goes through services + TanStack Query.
 */
import { create } from "zustand";
import type { TelemetryChannel } from "@/lib/terminology";

type Density = "compact" | "default";
export type Theme = "dark" | "light";
export type Lang = "en" | "pt";

function getStoredLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem("ep-lang");
  return v === "pt" || v === "en" ? v : null;
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("ep-theme") as Theme) || "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  html.classList.add(theme);
}

interface UiState {
  density: Density;
  sidebarPinned: boolean;
  theme: Theme;
  lang: Lang;
  langChosen: boolean;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  hydrateLang: () => void;
}
export const useUiStore = create<UiState>((set) => ({
  density: "default",
  sidebarPinned: true,
  theme: getStoredTheme(),
  setDensity: (density) => set({ density }),
  toggleSidebar: () => set((s) => ({ sidebarPinned: !s.sidebarPinned })),
  setTheme: (theme) => {
    localStorage.setItem("ep-theme", theme);
    applyTheme(theme);
    set({ theme });
  },
  lang: "en",
  langChosen: false,
  setLang: (lang) => {
    if (typeof window !== "undefined") localStorage.setItem("ep-lang", lang);
    if (typeof document !== "undefined")
      document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    set({ lang, langChosen: true });
  },
  hydrateLang: () => {
    const stored = getStoredLang();
    if (stored) {
      if (typeof document !== "undefined")
        document.documentElement.lang = stored === "pt" ? "pt-BR" : "en";
      set({ lang: stored, langChosen: true });
      return;
    }
    const nav = typeof navigator !== "undefined" ? (navigator.language || "").toLowerCase() : "";
    set({ lang: nav.startsWith("pt") ? "pt" : "en", langChosen: false });
  },
}));

interface SelectionState {
  selectedContractId: string | null;
  selectedCounterpartyId: string | null;
  selectedTxHash: string | null;
  selectedSettlementId: string | null;
  setSelectedContract: (id: string | null) => void;
  setSelectedCounterparty: (id: string | null) => void;
  setSelectedTx: (h: string | null) => void;
  setSelectedSettlement: (id: string | null) => void;
  clearAll: () => void;
}
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedContractId: null,
  selectedCounterpartyId: null,
  selectedTxHash: null,
  selectedSettlementId: null,
  setSelectedContract: (id) => set({ selectedContractId: id }),
  setSelectedCounterparty: (id) => set({ selectedCounterpartyId: id }),
  setSelectedTx: (h) => set({ selectedTxHash: h }),
  setSelectedSettlement: (id) => set({ selectedSettlementId: id }),
  clearAll: () =>
    set({
      selectedContractId: null,
      selectedCounterpartyId: null,
      selectedTxHash: null,
      selectedSettlementId: null,
    }),
}));

type ChannelHealth = "connected" | "degraded" | "offline";
interface LiveState {
  channels: Record<TelemetryChannel, { lastUpdate: string | null; health: ChannelHealth }>;
  markUpdate: (ch: TelemetryChannel, health?: ChannelHealth) => void;
  setHealth: (ch: TelemetryChannel, health: ChannelHealth) => void;
}
const channels: TelemetryChannel[] = [
  "settlements",
  "clearing",
  "reconciliation",
  "oracle",
  "risk",
  "treasury",
  "audit",
  "topology",
  "rail",
];
export const useLiveStore = create<LiveState>((set) => ({
  channels: Object.fromEntries(
    channels.map((c) => [c, { lastUpdate: null, health: "offline" as ChannelHealth }]),
  ) as LiveState["channels"],
  markUpdate: (ch, health = "connected") =>
    set((s) => ({
      channels: {
        ...s.channels,
        [ch]: { lastUpdate: new Date().toISOString(), health },
      },
    })),
  setHealth: (ch, health) =>
    set((s) => ({
      channels: { ...s.channels, [ch]: { ...s.channels[ch], health } },
    })),
}));
