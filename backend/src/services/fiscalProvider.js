/**
 * fiscalProvider.js — abstraction for official fiscal-document issuance
 * (NF-e / NFS-e).
 *
 * EnergyPay does NOT yet issue official fiscal invoices. Real issuance requires
 * an operational CNPJ, municipal registration, a valid digital certificate and
 * a configured fiscal provider. Until then the active provider is "NONE": it
 * never claims to issue NF-e/NFS-e and returns a clear pending status.
 *
 * The interfaces below mirror the frontend contract so a real provider
 * (PLUG_NOTAS / FOCUS_NFE / ASAAS / CUSTOM) can be dropped in later without
 * touching the routes that consume it.
 *
 * SECURITY: this module never receives or stores a digital-certificate file or
 * its password. Those are future, backend-encrypted concerns.
 */

export const FISCAL_PROVIDER = (process.env.FISCAL_PROVIDER || "NONE").toUpperCase();

/**
 * NONE provider — issuance disabled. Always returns a pending status that the
 * UI surfaces as "official issuance not yet available".
 */
class NoneFiscalProvider {
  get name() {
    return "NONE";
  }

  async issueInvoice(paymentId) {
    return {
      id: null,
      paymentId,
      type: "RECEIPT",
      status: "PENDING_COMPANY_TAX_PROFILE",
      provider: "NONE",
      errorMessage:
        "Official NF-e/NFS-e issuance is not enabled. EnergyPay's company tax profile and digital certificate are not configured yet.",
    };
  }

  async cancelInvoice(documentId) {
    return {
      id: documentId,
      type: "RECEIPT",
      status: "CANCELLED",
      provider: "NONE",
    };
  }

  async getInvoiceStatus(documentId) {
    return {
      id: documentId,
      type: "RECEIPT",
      status: "PENDING_COMPANY_TAX_PROFILE",
      provider: "NONE",
    };
  }
}

export function getFiscalProvider() {
  switch (FISCAL_PROVIDER) {
    // case "PLUG_NOTAS": return new PlugNotasProvider();
    // case "FOCUS_NFE":  return new FocusNfeProvider();
    case "NONE":
    default:
      return new NoneFiscalProvider();
  }
}

/**
 * Compute whether the platform is ready to issue official fiscal documents,
 * based on the company tax profile + digital certificate singletons.
 *
 * Returns a UI-friendly readiness object — never throws (degrades to the most
 * conservative "pending company tax profile" state on any error).
 */
export async function getFiscalReadiness(supabase) {
  const base = {
    provider: FISCAL_PROVIDER,
    can_issue_official: false,
    company_profile_status: "INCOMPLETE",
    certificate_status: "NOT_CONFIGURED",
    document_status: "PENDING_COMPANY_TAX_PROFILE",
    message_en:
      "Official NF-e/NFS-e issuance will be available after EnergyPay's company tax profile and digital certificate are configured.",
    message_pt:
      "A emissão oficial de NF-e/NFS-e estará disponível após a configuração do perfil fiscal da EnergyPay e do certificado digital.",
  };

  try {
    const [{ data: profile }, { data: cert }] = await Promise.all([
      supabase
        .from("company_tax_profile")
        .select("status")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("digital_certificate_status")
        .select("status")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const companyStatus = profile?.status ?? "INCOMPLETE";
    const certStatus = cert?.status ?? "NOT_CONFIGURED";

    base.company_profile_status = companyStatus;
    base.certificate_status = certStatus;

    if (FISCAL_PROVIDER === "NONE") {
      base.document_status = "PENDING_COMPANY_TAX_PROFILE";
      return base;
    }
    if (companyStatus !== "ACTIVE") {
      base.document_status = "PENDING_COMPANY_TAX_PROFILE";
      return base;
    }
    if (certStatus !== "VALID") {
      base.document_status = "PENDING_DIGITAL_CERTIFICATE";
      base.message_en = "A valid digital certificate is required before issuing official fiscal documents.";
      base.message_pt = "Um certificado digital válido é necessário para emitir documentos fiscais oficiais.";
      return base;
    }

    base.can_issue_official = true;
    base.document_status = "READY_TO_ISSUE";
    base.message_en = "EnergyPay is configured to issue official fiscal documents.";
    base.message_pt = "A EnergyPay está configurada para emitir documentos fiscais oficiais.";
    return base;
  } catch {
    return base;
  }
}
