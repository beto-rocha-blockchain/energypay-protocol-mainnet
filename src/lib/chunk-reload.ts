// src/lib/chunk-reload.ts
//
// Auto-recover from stale-bundle errors after a deploy.
//
// When a new deploy rotates Vite's content-hashed JS chunks, browser tabs still
// running the OLD bundle fail to fetch a now-404 chunk — surfacing as a Vite
// "preloadError" or a "Failed to fetch dynamically imported module" TypeError,
// which lands the operator on the "Something went wrong" screen.
//
// Instead of stranding them, do a single cache-busting reload to pick up the
// fresh index.html + new chunk hashes. A short cooldown (sessionStorage) guards
// against a reload loop if the fresh bundle is somehow still broken.

const RELOAD_KEY = "ep:chunk-reload-ts";
const COOLDOWN_MS = 15_000;

/** Heuristic: is this error a stale-bundle / failed dynamic-import error? */
export function isChunkLoadError(reason: unknown): boolean {
  const msg =
    typeof reason === "string"
      ? reason
      : reason && typeof reason === "object" && "message" in reason
        ? String((reason as { message?: unknown }).message ?? "")
        : "";
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /loading chunk \d+ failed/i.test(msg) ||
    /chunkloaderror/i.test(msg)
  );
}

/** Reload once to fetch a fresh bundle. No-ops on the server and during cooldown. */
export function reloadForFreshBundle(): void {
  if (typeof window === "undefined") return;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) return;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode / blocked) — reload anyway.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

/** Install global listeners that auto-reload on a stale-bundle chunk error. */
export function installChunkReload(): void {
  if (typeof window === "undefined") return;
  const flag = window as unknown as { __epChunkReloadInstalled?: boolean };
  if (flag.__epChunkReloadInstalled) return;
  flag.__epChunkReloadInstalled = true;

  // Vite's official event for a failed dynamic-import preload (the common case).
  window.addEventListener("vite:preloadError", (event: Event) => {
    event.preventDefault();
    reloadForFreshBundle();
  });

  // Unhandled promise rejections from runtime import() failures.
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) reloadForFreshBundle();
  });

  // Synchronous module/script load errors.
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.message) || isChunkLoadError(event.error)) {
      reloadForFreshBundle();
    }
  });
}
