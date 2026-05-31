/**
 * Per-contract supply cap + partial-settlement math (pure, side-effect free).
 *
 * Rule (the per-contract supply cap): emitted (settled_mwh) + this tranche must
 * never exceed the contracted volume. The platform must not settle/issue more
 * energy than the contract authorizes — protecting against over-settlement and
 * representing value without contractual backing.
 *
 * Returns either { ok:true, settleAmount, remaining, newSettled, fullySettled }
 * or { ok:false, code, error, remaining } with a typed rejection.
 */
const EPS = 1e-9;
const round6 = (n) => Math.round(n * 1e6) / 1e6;

export function computeSettlement({ volumeMwh, settledMwh, requestedMwh }) {
  const total = Number(volumeMwh);
  const already = Number(settledMwh || 0);

  if (!(total > 0)) {
    return { ok: false, code: "INVALID_CONTRACT_VOLUME", error: "Contract has no positive volume.", remaining: 0 };
  }

  const remaining = round6(total - already);
  if (remaining <= 0) {
    return { ok: false, code: "ALREADY_SETTLED", error: "Contract fully settled (supply cap reached).", remaining: 0 };
  }

  const requested = requestedMwh == null ? remaining : Number(requestedMwh);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, code: "INVALID_SETTLE_AMOUNT", error: "settle_mwh must be a positive number.", remaining };
  }
  if (requested > remaining + EPS) {
    return {
      ok: false,
      code: "SUPPLY_CAP_EXCEEDED",
      error: `Requested ${requested} MWh exceeds remaining ${remaining} MWh (supply cap = ${total} MWh).`,
      remaining,
    };
  }

  const settleAmount = round6(Math.min(requested, remaining));
  const newSettled = round6(already + settleAmount);
  const fullySettled = newSettled >= total - EPS;
  return { ok: true, settleAmount, remaining, newSettled, fullySettled };
}
