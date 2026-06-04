/**
 * Admin audit + owner ("Deus") notification.
 *
 * logAudit() writes the immutable admin_audit_log entry (as before) AND, for any
 * action performed by someone who is NOT the platform owner, drops an in-app
 * notification into every PLATFORM_OWNER's inbox — so the owner is informed of
 * all actions taken by other administrators.
 *
 * Reuses the existing tables: admin_audit_log (migration 006) and notifications
 * (migration 003). No schema change required. Both writes are best-effort and
 * never throw into the calling request handler.
 */
import { supabase } from "./supabase.js";

/** Human-readable labels for the admin actions, for the owner notification text. */
const ACTION_LABELS = {
  UPDATE_PROFILE: "updated a user profile",
  RECOVER_PASSWORD: "reset a user password",
  BLOCK_USER: "blocked a user",
  UNBLOCK_USER: "unblocked a user",
  SET_EMAIL: "changed a user's email",
  SET_PLATFORM_ROLE: "changed a platform role",
  SET_MARKET_ROLES: "changed market roles",
  APPROVE_ROLES: "approved role requests",
  REJECT_ROLES: "rejected role requests",
  ADD_RECOVERY_LINK: "added a recovery link",
  REMOVE_RECOVERY_LINK: "removed a recovery link",
  DELETE_INACTIVE_ACCOUNT: "deleted an inactive account",
  PLD_INGEST: "ingested PLD oracle data",
};

function humanLabel(action) {
  return ACTION_LABELS[action] || String(action || "performed an action").toLowerCase().replace(/_/g, " ");
}

/**
 * Inform every PLATFORM_OWNER (except the actor) of an admin action.
 * Best-effort: any failure is logged and swallowed.
 */
async function notifyOwnersOfAdminAction({ actorId, targetId, action }) {
  try {
    if (!actorId) return;

    // Acting admin (for a readable message)
    const { data: actor } = await supabase
      .from("users")
      .select("id, email, full_name, platform_role")
      .eq("id", actorId)
      .single();

    // Optional target user
    let targetEmail = null;
    if (targetId) {
      const { data: target } = await supabase
        .from("users")
        .select("email")
        .eq("id", targetId)
        .single();
      targetEmail = target?.email ?? null;
    }

    // Every platform owner EXCEPT the actor gets informed.
    const { data: owners } = await supabase
      .from("users")
      .select("id")
      .eq("platform_role", "PLATFORM_OWNER")
      .neq("id", actorId);

    if (!owners?.length) return;

    const actorName = actor?.full_name || actor?.email || "An administrator";
    const label = humanLabel(action);
    const targetClause = targetEmail ? ` on ${targetEmail}` : "";

    const rows = owners.map((o) => ({
      user_id: o.id,
      contract_id: null,
      type: "ADMIN_ACTION",
      title: `Admin activity · ${actorName}`,
      message: `${actorName} ${label}${targetClause}.`,
      action_label: "View activity",
      action_url: "/admin?tab=activity",
      read: false,
    }));

    const { error } = await supabase.from("notifications").insert(rows);
    if (error) console.error("[audit-notify]", error.message);
  } catch (err) {
    console.error("[audit-notify]", err.message);
  }
}

/**
 * Fire-and-forget audit writer. Inserts the admin_audit_log row, then informs
 * the platform owner(s) of actions taken by anyone else. Never throws.
 */
export async function logAudit({ actorId, targetId = null, action, details = {}, ip = null }) {
  // Supabase query builder is thenable but has no .catch() — handle via try/catch
  // and the returned { error } so audit logging never throws into the caller.
  try {
    const { error } = await supabase.from("admin_audit_log").insert([{
      actor_id: actorId,
      target_id: targetId,
      action,
      details,
      ip_address: ip,
    }]);
    if (error) console.error("[audit]", error.message);
  } catch (err) {
    console.error("[audit]", err.message);
  }

  // Inform the platform owner(s) — actions by other admins are reported to "Deus".
  await notifyOwnersOfAdminAction({ actorId, targetId, action });
}
