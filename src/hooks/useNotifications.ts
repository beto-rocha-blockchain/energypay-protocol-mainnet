import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Notification,
  apiGetNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiDeleteNotification,
  apiApproveContract,
  apiRejectContract,
  apiGetContractApprovals,
} from "@/lib/api";
import { useOperator } from "@/store/operator";

const POLL_INTERVAL_MS = 30_000; // 30 s

/**
 * How long after a read APPROVAL_REQUIRED notification was first seen before
 * checking whether the approval is still actionable. If the contract has
 * already been settled / rejected / failed, the notification is dismissed
 * silently. If the approval is still PENDING, it is kept indefinitely.
 */
const STUCK_DISMISS_DELAY_MS = 5 * 60 * 1000; // 5 minutes

type UseNotificationsReturn = {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  approve: (contractId: string) => Promise<{ activated: boolean }>;
  reject: (contractId: string, reason?: string) => Promise<void>;
  refresh: () => void;
  /** Immediately remove a notification from the local list and mark it read in
   *  the DB. Used when an action permanently fails (e.g. contract no longer
   *  in DRAFT). */
  softDismiss: (id: string) => void;
};

export function useNotifications(): UseNotificationsReturn {
  const isAuthenticated = useOperator((s) => s.isAuthenticated);
  const operator        = useOperator((s) => s.operator);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const stuckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Maps notificationId → timestamp of when it first appeared as read.
   * Only populated for APPROVAL_REQUIRED notifications.
   */
  const readAtRef = useRef<Map<string, number>>(new Map());

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiGetNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
    } catch {
      // non-fatal
    }
  }, [isAuthenticated]);

  const refresh = useCallback(() => void fetch(), [fetch]);

  // ── polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetch();
    pollRef.current = setInterval(fetch, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isAuthenticated, fetch]);

  // ── track when APPROVAL_REQUIRED notifications first become read ───────────

  useEffect(() => {
    notifications.forEach((n) => {
      if (
        n.type === "APPROVAL_REQUIRED" &&
        n.read &&
        !readAtRef.current.has(n.id)
      ) {
        readAtRef.current.set(n.id, Date.now());
      }
    });
  }, [notifications]);

  // ── periodic stuck-notification check ────────────────────────────────────
  // Every 60 s: for APPROVAL_REQUIRED notifications that have been read for
  // >= 5 minutes, check if the user's approval is still PENDING on the contract.
  // If not (contract settled / rejected / failed by another party), dismiss silently.
  // If yes (contract still in DRAFT and awaiting this user), keep it indefinitely.

  useEffect(() => {
    if (!isAuthenticated || !operator) return;

    const checkStuck = async () => {
      const now        = Date.now();
      const myKey      = operator.wallet?.publicKey;
      if (!myKey) return; // can't verify ownership — skip for safety

      const candidates = notifications.filter(
        (n) =>
          n.type === "APPROVAL_REQUIRED" &&
          n.contract_id &&
          n.read &&
          readAtRef.current.has(n.id) &&
          now - readAtRef.current.get(n.id)! >= STUCK_DISMISS_DELAY_MS,
      );

      for (const n of candidates) {
        try {
          const { approvals } = await apiGetContractApprovals(n.contract_id!);
          const stillPending = approvals.some(
            (a) => a.status === "PENDING" && a.party_public_key === myKey,
          );
          if (!stillPending) {
            // Contract no longer needs this user's approval — delete permanently
            await apiDeleteNotification(n.id).catch(() => {});
            setNotifications((prev) => prev.filter((x) => x.id !== n.id));
            readAtRef.current.delete(n.id);
          }
        } catch {
          // non-fatal: leave notification in place if check fails
        }
      }
    };

    stuckRef.current = setInterval(checkStuck, 60_000);
    return () => { if (stuckRef.current) clearInterval(stuckRef.current); };
  }, [isAuthenticated, notifications, operator]);

  // ── actions ────────────────────────────────────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    await apiMarkNotificationRead(id).catch(() => {});
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await apiMarkAllNotificationsRead().catch(() => {});
  }, []);

  const approve = useCallback(
    async (contractId: string): Promise<{ activated: boolean }> => {
      setLoading(true);
      try {
        const res = await apiApproveContract(contractId);
        await fetch();
        return { activated: res.activated };
      } finally {
        setLoading(false);
      }
    },
    [fetch],
  );

  const reject = useCallback(
    async (contractId: string, reason?: string) => {
      setLoading(true);
      try {
        await apiRejectContract(contractId, reason);
        await fetch();
      } finally {
        setLoading(false);
      }
    },
    [fetch],
  );

  const softDismiss = useCallback((id: string) => {
    setNotifications((prev) => {
      const n = prev.find((x) => x.id === id);
      if (n && !n.read) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((x) => x.id !== id);
    });
    readAtRef.current.delete(id);
    apiDeleteNotification(id).catch(() => {});
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    approve,
    reject,
    refresh,
    softDismiss,
  };
}
