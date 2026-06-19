/**
 * /api/notifications — In-platform notification inbox
 *
 * GET  /                 → list notifications for current user (latest 50)
 * POST /read-all         → mark all as read
 * POST /:id/read         → mark one as read
 */

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// GET /api/notifications
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    let notifications = data ?? [];

    // Drop stale approval notifications: once a contract leaves DRAFT (approved /
    // settled / rejected / failed) it can no longer be approved, so it must
    // disappear from the approval queue — including the master/owner's.
    const approvalContractIds = [
      ...new Set(
        notifications
          .filter((n) => n.type === "APPROVAL_REQUIRED" && n.contract_id)
          .map((n) => n.contract_id),
      ),
    ];
    if (approvalContractIds.length > 0) {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, status")
        .in("id", approvalContractIds);
      const draftIds = new Set(
        (contracts ?? []).filter((c) => c.status === "DRAFT").map((c) => c.id),
      );
      notifications = notifications.filter(
        (n) =>
          n.type !== "APPROVAL_REQUIRED" ||
          !n.contract_id ||
          draftIds.has(n.contract_id),
      );
    }

    const unread_count = notifications.filter((n) => !n.read).length;

    return res.json({
      success: true,
      notifications,
      unread_count,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/read-all
router.post("/read-all", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/:id/read
router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", req.params.id)
      .eq("user_id", userId);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notifications/:id
// Permanently removes a notification that is no longer actionable.
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.operator.sub || req.operator.id;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId); // scoped to owner — cannot delete another user's notification

    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
