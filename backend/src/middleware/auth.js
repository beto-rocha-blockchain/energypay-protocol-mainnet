import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase.js";

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;

    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Bearer token required.",
      });
    }

    const token = auth.replace("Bearer ", "");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.operator = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid token.",
    });
  }
}

/**
 * Platform-role guard — always does a live DB lookup so role changes take
 * effect immediately (doesn't rely on the JWT payload).
 *
 * Usage:
 *   router.get("/users", requirePlatformRole("PLATFORM_OWNER", "PLATFORM_ADMIN"), handler)
 *
 * Sets req.adminUser = { id, email, platform_role } on success.
 */
export function requirePlatformRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Bearer token required." });
      }

      const token = auth.replace("Bearer ", "");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // sub is set on register; id is set on login; handle both
      const userId = decoded.sub || decoded.id;
      if (!userId) return res.status(401).json({ error: "Invalid token payload." });

      // Live DB lookup — role changes take effect without re-login
      const { data: user, error } = await supabase
        .from("users")
        .select("id, email, platform_role")
        .eq("id", userId)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: "User not found." });
      }

      const currentRole = user.platform_role ?? "USER";
      if (!allowedRoles.includes(currentRole)) {
        return res.status(403).json({
          error: "Insufficient platform role.",
          required: allowedRoles,
          current: currentRole,
        });
      }

      req.operator   = decoded;
      req.adminUser  = { id: user.id, email: user.email, platformRole: currentRole };
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token." });
    }
  };
}
