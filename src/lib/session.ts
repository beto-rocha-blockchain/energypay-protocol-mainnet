import type { ApiUser } from "./api";

const KEY = "session";

export type AuthSession = {
  token: string;
  user: ApiUser;
  createdAt: string;
};

const isBrowser = () => typeof window !== "undefined";

// The auth session is stored in sessionStorage (NOT localStorage) so it is
// cleared automatically when the browser tab/window is closed — on the next
// open the user must log in again. (Reloading the same tab keeps the session.)
export const getSession = (): AuthSession | null => {
  if (!isBrowser()) return null;

  try {
    const raw = window.sessionStorage.getItem(KEY);

    if (!raw) return null;

    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
};

export const setSession = (session: AuthSession) => {
  if (!isBrowser()) return;

  window.sessionStorage.setItem(KEY, JSON.stringify(session));
};

export const clearSession = () => {
  if (!isBrowser()) return;

  window.sessionStorage.removeItem(KEY);
  // Defensive: clear any legacy auth left in localStorage by older builds.
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
};

// One-time purge of legacy localStorage auth from pre-sessionStorage builds, so
// no token lingers persistently. Runs once when this module is first imported.
if (isBrowser()) {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("token");
  } catch {
    /* ignore */
  }
}
