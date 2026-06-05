import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { COUNTRIES, getStates, getCities } from "@/lib/geo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { stellarExpertAccount, STELLAR_NETWORK_LABEL, HORIZON_URL, IS_MAINNET } from "@/lib/stellar";
import {
  Zap,
  Building2,
  Mail,
  MapPin,
  Globe2,
  User,
  Lock,
  ShieldCheck,
  Activity,
  Terminal,
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  Factory,
  Coins,
  LineChart,
  Plug,
  Copy,
  KeyRound,
  Eye,
  EyeOff,
  Phone,
  Sun,
  Moon,
  ExternalLink,
  Droplets,
  Wind,
  Flame,
  Waves,
  Leaf,
  Atom,
  Recycle,
  Scale,
  HelpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useOperator, maskAddress, ROLE_META, ROLE_COLORS, type ParticipantRole } from "@/store/operator";
import { BrandBadge, BrandName } from "@/components/BrandLogo";
import { useUiStore, type Theme } from "@/store/ui";
import { toast } from "sonner";
import { safeErrorMessage } from "@/lib/safe-error";
import { apiResendVerification, apiSendPhoneCode, apiVerifyPhoneCode, apiUploadIdentityDocument } from "@/lib/api";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { startRegisterTour } from "@/lib/tour";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

type Step = "form" | "provisioning" | "verify-email" | "verify-phone" | "success";

const ROLE_ICON: Record<ParticipantRole, React.ComponentType<{ className?: string }>> = {
  GENERATOR: Factory,
  SELLER: Coins,
  INVESTOR: LineChart,
  USER: Plug,
  UTILITY: Building2,
  REGULATORY_AUTHORITY: Scale,
  ADMIN: ShieldCheck,
};

const PROVISIONING_STEPS = [
  "Validating institutional credentials",
  "Allocating operator identity",
  "Generating ed25519 keypair",
  "Binding settlement address to operator",
  "Verifying settlement account funding on Stellar Mainnet",
  "Registering market participant roles",
  "Publishing identity to Settlement Network",
];

function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const isAuthenticated = useOperator((s) => s.isAuthenticated);
  const register = useOperator((s) => s.register);
  const operator = useOperator((s) => s.operator);

  const [step, setStep] = useState<Step>("form");
  const [progress, setProgress] = useState(0);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [formStep, setFormStep] = useState(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [organization, setOrganization] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [roles, setRoles] = useState<ParticipantRole[]>([]);
  const [fund, setFund] = useState(true);
  const [coords, setCoordsLocal] = useState<
    { lat: number; lng: number; source: "GPS" | "MANUAL" } | undefined
  >(undefined);
  const [geoStatus, setGeoStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [walletMode, setWalletMode] = useState<"generate" | "link">("generate");
  const [existingPublicKey, setExistingPublicKey] = useState("");
  const [energyTypes, setEnergyTypes] = useState<
    ("SOLAR" | "HYDRO" | "SMALL_HYDRO" | "WIND" | "BIOMASS" | "NATURAL_GAS" | "NUCLEAR" | "THERMAL" | "COGENERATION")[]
  >(["SOLAR"]);
  const [documentType, setDocumentType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  // NOTE: authorityType / REGULATORY_AUTHORITY removed from public onboarding.
  // TODO: Regulatory/Institutional oversight access should remain internal/admin-only
  // or future enterprise configuration. Must not be exposed in the public onboarding flow.

  // If a session already exists when landing on /register fresh (no in-flight
  // provisioning), send the operator to the dashboard. Never redirect once we
  // are mid-flow or showing the success screen — that would clobber the
  // provisioned identity view.
  // Disabled for demo stability.
// Do not auto-redirect after session hydration or registration.
useEffect(() => {
  // Intentionally empty.
}, []);

  // With the per-field carousel each slide is self-explanatory (big title +
  // description), so the floating-bubble tour is no longer needed here. The
  // `startRegisterTour` import is preserved for a possible "help" button in
  // the future, but we intentionally do NOT auto-start it.
  const langChosen = useUiStore((s) => s.langChosen);
  void langChosen;

  const toggleRole = (r: ParticipantRole) => {
    if (roles.includes(r)) {
      setRoles(roles.filter((x) => x !== r));
      return;
    }
    setRoles([...roles, r]);
  };

  const selectAll = () => {
    setRoles(["GENERATOR", "SELLER", "INVESTOR", "USER", "UTILITY"]);
  };

  // Basic phone validation: must have country code + at least 8 digits
  const phoneValid = useMemo(() => {
    const digits = phone.replace(/[^\d]/g, "");
    return phone.trim().startsWith("+") && digits.length >= 8;
  }, [phone]);

  const linkValid = useMemo(() => {
    if (walletMode !== "link") return true;
    return existingPublicKey.trim().startsWith("G") && existingPublicKey.trim().length === 56;
  }, [walletMode, existingPublicKey]);

  const availableStates = useMemo(() => getStates(country), [country]);
  const availableCities = useMemo(() => getCities(country, state || undefined), [country, state]);
  const stateRequired = availableStates.length > 0;

  // Identity document — country-aware. Brazil validates CPF (11) / CNPJ (14);
  // other countries accept a generic tax/registration ID.
  const isBrazil = useMemo(
    () => ["br", "bra", "brasil", "brazil"].includes(country.trim().toLowerCase()),
    [country],
  );
  const docValid = useMemo(() => {
    const raw = documentNumber.trim();
    if (!raw) return true; // CPF/CNPJ is optional — empty is allowed; format is only checked if filled
    if (isBrazil) {
      const d = raw.replace(/\D/g, "");
      return documentType === "COMPANY" ? d.length === 14 : d.length === 11;
    }
    return raw.length >= 4;
  }, [documentNumber, isBrazil, documentType]);
  const docLabel = (!isBrazil ? t("Tax / Registration ID") : documentType === "COMPANY" ? "CNPJ" : "CPF") + " " + t("(optional)");
  const docHint = !isBrazil
    ? t("Enter at least 4 characters.")
    : documentType === "COMPANY" ? t("CNPJ must have 14 digits.") : t("CPF must have 11 digits.");

  const formValid = useMemo(
    () =>
      fullName.trim() &&
      email.trim() &&
      password.length >= 6 &&
      organization.trim() &&
      country.trim() &&
      (!stateRequired || state.trim()) &&
      city.trim() &&
      docValid &&
      roles.length > 0 &&
      phoneValid &&
      linkValid,
    [fullName, email, password, organization, country, state, stateRequired, city, docValid, roles, phoneValid, linkValid],
  );

  // ── Per-field carousel onboarding ──────────────────────────────────────────
  //
  // Each sign-up field is shown one at a time on its own slide. The list below
  // is the canonical order; `shouldShow` lets some slides be skipped based on
  // earlier answers (e.g. State only appears when the chosen country has one;
  // Generation sources only when GENERATOR is among the roles).
  type FieldKey =
    | "fullName"
    | "email"
    | "phone"
    | "password"
    | "organization"
    | "country"
    | "state"
    | "city"
    | "documentType"
    | "documentNumber"
    | "roles"
    | "energyTypes"
    | "wallet"
    | "review";

  type FieldDef = {
    key: FieldKey;
    title: string;        // big heading on the slide
    description: string;  // one-paragraph explanation
    optional?: boolean;
    valid: boolean;       // is the field currently filled correctly?
    shouldShow: boolean;  // include this slide in the carousel?
  };

  const FIELDS: FieldDef[] = [
    { key: "fullName",       title: t("What's your full name?"),               description: t("Your name is the human-readable identity for your operator account. Use the same name that appears on official documents — it's how the network will recognise you."), valid: Boolean(fullName.trim()), shouldShow: true },
    { key: "email",          title: t("Your operator email"),                  description: t("This is how you sign in to the platform and where we send the verification link at the end of sign-up. Use an email you check regularly."),                          valid: Boolean(email.trim()),    shouldShow: true },
    { key: "phone",          title: t("Your phone number"),                    description: t("Required for two-factor authentication. Include the country code — for example +55 11 99999-9999. We'll never share this number."),                                  valid: phoneValid,                shouldShow: true },
    { key: "password",       title: t("Create a password"),                    description: t("Use at least 6 characters. This password protects your settlement identity — pick something only you know."),                                                          valid: password.length >= 6,      shouldShow: true },
    { key: "organization",   title: t("Your organization"),                    description: t("Tell us the name of the company, generator, distributor or institution you represent. If you're an individual operator, use your own name."),                          valid: Boolean(organization.trim()), shouldShow: true },
    { key: "country",        title: t("Where are you based?"),                 description: t("Choose your country. The next slides — state and city — will load the available options for the country you pick here."),                                            valid: Boolean(country.trim()),    shouldShow: true },
    { key: "state",          title: t("Your state / province"),                description: t("Select the state or province inside the country you chose. This helps with regional liquidity attribution and regulatory reporting."),                                valid: !stateRequired || Boolean(state.trim()), shouldShow: stateRequired },
    { key: "city",           title: t("Your city"),                            description: t("Choose your city from the list, or pick \"Other…\" to type it in. This pins your operator on the grid map."),                                                       valid: Boolean(city.trim()),       shouldShow: true },
    { key: "documentType",   title: t("Are you an individual or a company?"),  description: t("Pick \"Individual\" if you'll operate as a person (CPF) or \"Company\" if you'll operate as a legal entity (CNPJ)."),                                                valid: true,                       shouldShow: true },
    { key: "documentNumber", title: t("Tax / identity document (optional)"),   description: t("Add your CPF, CNPJ or local tax/registration ID. This step is optional — you can complete it later from your profile."), optional: true, valid: docValid,                shouldShow: true },
    { key: "roles",          title: t("Pick your market roles"),               description: t("Select every role you want to act as on the platform — Generator, Trader, Investor, Consumer or Utility. Roles define what you can do; you can pick more than one."), valid: roles.length > 0,           shouldShow: true },
    { key: "energyTypes",    title: t("Your generation sources"),              description: t("Since you're operating as a Generator, tell us every type of energy you produce. Pick all that apply — solar, wind, hydro, biomass, and so on."),                    valid: energyTypes.length > 0,     shouldShow: roles.includes("GENERATOR") },
    { key: "wallet",         title: t("Activate your settlement wallet"),      description: t("Your wallet is the Stellar account that holds EPWR (1 token = 1 MWh) and settles your contracts. Choose Managed if you want EnergyPay to safeguard the keys for you (recommended for first-time users), or Link to use your own existing Stellar wallet."), valid: linkValid, shouldShow: true },
    { key: "review",         title: t("Ready to provision your identity"),     description: t("Review everything below and confirm — we'll mint your identity, bind your ed25519 keypair and register your roles on Stellar. Email confirmation follows."),         valid: Boolean(formValid),         shouldShow: true },
  ];

  const visibleFields = FIELDS.filter((f) => f.shouldShow);
  const safeStep = Math.min(formStep, visibleFields.length - 1);
  const currentField = visibleFields[safeStep];

  // Auto-rewind when a previously-visible step becomes hidden (e.g. user
  // deselects GENERATOR while sitting on the Generation Sources slide).
  useEffect(() => {
    if (formStep > visibleFields.length - 1) {
      setFormStep(visibleFields.length - 1);
    }
  }, [visibleFields.length, formStep]);

  const goNext = () => {
    if (currentField && !currentField.valid && !currentField.optional) {
      toast.error(t("Complete the highlighted fields to continue."));
      return;
    }
    setFormStep((s) => Math.min(s + 1, visibleFields.length - 1));
  };
  const goBack = () => setFormStep((s) => Math.max(s - 1, 0));

  const provisioningSteps = useMemo(
    () =>
      PROVISIONING_STEPS.map((s) =>
        s === "Generating ed25519 keypair" && walletMode === "link"
          ? "Importing existing ed25519 keypair"
          : s,
      ),
    [walletMode],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // On non-final steps the primary button just advances the wizard.
    if (safeStep < visibleFields.length - 1) {
      goNext();
      return;
    }
    if (!formValid) {
      toast.error(t("Operational credentials incomplete."));
      return;
    }
    setProvisionError(null);
    setStep("provisioning");
    setProgress(0);
    for (let i = 0; i < provisioningSteps.length; i++) {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 350));
      setProgress(i + 1);
    }
    try {
      await register({
        email,
        password,
        fullName,
        phone: phone.trim() || undefined,
        organization,
        country,
        state: state.trim() || undefined,
        city,
        roles,
        fund,
        coords,
        energyTypes: roles.includes("GENERATOR") ? energyTypes : undefined,
        walletMode,
        existingPublicKey: walletMode === "link" ? existingPublicKey : undefined,
        documentType,
        cpfCnpj: documentNumber.trim(),
      });
      // Optional identity PDF — non-blocking (session is set by register()).
      if (documentFile) {
        try {
          await apiUploadIdentityDocument(documentFile);
        } catch (uploadErr) {
          toast.error(`${t("Identity document upload failed (you can add it later):")} ${(uploadErr as Error).message}`);
        }
      }
      setProvisionError(null);
      setStep("verify-email");
    } catch (err) {
      const reason = safeErrorMessage(err, t("Settlement Network unreachable."));
      setProvisionError(reason);
      // Do NOT clear session, do NOT redirect to /login — keep operator on
      // the form with an inline institutional error banner.
      setStep("form");
    }
  };

  const requestGeo = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      toast.error(t("Geolocation unavailable on this device."));
      return;
    }
    setGeoStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordsLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "GPS" });
        setGeoStatus("granted");
        toast.success(t("Operational coordinates bound to identity."));
      },
      () => {
        setGeoStatus("denied");
        toast.error(t("GPS denied — provide a region manually."));
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const applyManual = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCoordsLocal({ lat, lng, source: "MANUAL" });
      toast.success(t("Manual region recorded."));
    } else {
      toast.error(t("Enter valid latitude/longitude."));
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center px-4 py-8">
      <div className="w-full max-w-6xl space-y-4">
        {/* Top: info panel — horizontal, full width */}
        <Card className="overflow-hidden border-border bg-card/60 p-5">
          <div className="flex flex-wrap items-start gap-5 lg:flex-nowrap lg:gap-6">

            {/* A · Brand + heading */}
            <div className="flex w-full flex-col gap-3 lg:w-[14rem] lg:shrink-0">
              <div className="flex items-center gap-2">
                <BrandBadge size="md" />
                <div className="leading-tight" style={{ gap: 3, display: "flex", flexDirection: "column" }}>
                  <BrandName size="md" />
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("Clearing & Settlement Infrastructure")}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("Network Provisioning · Pilot Environment")}
                </div>
                <h1 className="font-display text-lg font-semibold leading-snug">
                  {t("Provision a settlement participant identity.")}
                </h1>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("Mints an identity, binds an ed25519 keypair and registers your market roles on Stellar.")}
                </p>
              </div>
            </div>

            {/* vertical divider */}
            <div className="hidden w-px self-stretch bg-border/60 lg:block" />

            {/* B · Onboarding Steps */}
            <div className="flex-1 min-w-[220px]">
              <div className="mb-3 text-[10px] font-mono font-semibold uppercase tracking-widest text-foreground/60">
                {t("Onboarding Steps")}
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                {(
                  [
                    { n: "01", label: "Fill this form",         sub: "Credentials, roles & wallet" },
                    { n: "02", label: "Verify your email",      sub: "Confirmation link sent to your inbox" },
                    { n: "03", label: "Access the environment", sub: "Settlement identity is live" },
                  ] as const
                ).map(({ n, label, sub }) => (
                  <div key={n} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-primary">{n}</span>
                    <span>
                      <span className="block font-mono text-xs font-semibold text-foreground">{t(label)}</span>
                      <span className="block text-[11px] leading-relaxed text-muted-foreground">{t(sub)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* vertical divider */}
            <div className="hidden w-px self-stretch bg-border/60 lg:block" />

            {/* C · Network + Required */}
            <div className="flex shrink-0 flex-wrap gap-3">
              <div className="rounded-md border border-border bg-background/40 p-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <div className="flex items-center justify-between gap-4">
                  <span>{t("Network")}</span>
                  <span className="flex items-center gap-1 text-success">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> {t("Nominal")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 border-t border-border/40 pt-2">
                  <span>{t("Chain")}</span>
                  <span className="text-right text-foreground">{STELLAR_NETWORK_LABEL}</span>
                  <span>Horizon</span>
                  <span className="break-all text-right text-foreground">{HORIZON_URL.replace("https://", "")}</span>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/40 p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("Required")}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span>{t("Institutional email")}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span>{t("WhatsApp phone")}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 shrink-0" />
                    <span>{t("Participant role")}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <KeyRound className="h-3 w-3 shrink-0" />
                    <span>{t("Backend key custody")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>{t("EnergyPay Clearing · v0.4.2")}</span>
            <Link to="/login" className="text-foreground hover:text-primary">
              {t("Operator Access →")}
            </Link>
          </div>
        </Card>

        {/* Form: provisioning terminal — full width */}
        <Card className="overflow-hidden border-border bg-card/70">
          <div className="flex items-center justify-between border-b border-border bg-background/40 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t("Settlement Network · Provisioning Terminal")}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {t("SECURE · TLS · ed25519")}
            </div>
          </div>

          {step === "form" && (
            <form onSubmit={submit} className="space-y-6 p-5 sm:p-8">
              {/* Header row — step counter + carousel dots */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {t("Step")} {safeStep + 1} {t("of")} {visibleFields.length}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest text-primary">
                    {currentField?.optional ? t("Optional") : t("Required")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {visibleFields.map((f, i) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => i <= safeStep && setFormStep(i)}
                      aria-label={`${t("Go to step")} ${i + 1}`}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        i < safeStep
                          ? "bg-primary"
                          : i === safeStep
                            ? "bg-primary"
                            : "bg-border"
                      } ${i <= safeStep ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"}`}
                    />
                  ))}
                </div>
              </div>

              {provisionError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-destructive">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                      {t("Provisioning Failed · Settlement Rail")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setProvisionError(null)}
                      className="text-destructive/80 hover:text-destructive"
                    >
                      {t("DISMISS")}
                    </button>
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-foreground break-words">
                    {provisionError}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {t("Session preserved. Re-submit when the backend is reachable — no operator state was cleared.")}
                  </div>
                </div>
              )}

              {/* ── Carousel slide · one field at a time ─────────────────── */}
              <div
                key={currentField?.key}
                className="space-y-5 rounded-lg border border-border bg-background/30 p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 sm:p-6"
              >
                {/* Slide heading */}
                <div className="space-y-2">
                  <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                    {currentField?.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {currentField?.description}
                  </p>
                </div>

                {/* Slide field */}
                <div className="pt-1">
                  {currentField?.key === "fullName" && (
                    <div className="space-y-2">
                      <Label htmlFor="fld-fullname" className="text-sm font-medium">{t("Full Name")}</Label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="fld-fullname"
                          autoFocus
                          data-tour="reg-fullname"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder={t("e.g. João da Silva")}
                          className="h-12 pl-10 text-base"
                        />
                      </div>
                    </div>
                  )}

                  {currentField?.key === "email" && (
                    <div className="space-y-2">
                      <Label htmlFor="fld-email" className="text-sm font-medium">{t("Operator Email")}</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="fld-email"
                          autoFocus
                          data-tour="reg-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="h-12 pl-10 text-base"
                        />
                      </div>
                    </div>
                  )}

                  {currentField?.key === "phone" && (
                    <div className="space-y-2">
                      <Label htmlFor="fld-phone" className="text-sm font-medium">{t("Phone Number *")}</Label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="fld-phone"
                          autoFocus
                          data-tour="reg-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+55 11 99999-9999"
                          className={cn(
                            "h-12 pl-10 text-base",
                            phone && !phoneValid && "border-destructive/60",
                          )}
                        />
                      </div>
                      {phone && !phoneValid && (
                        <p className="text-xs text-destructive">
                          {t("Include country code — e.g. +55 11 99999-9999")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{t("Required for 2FA. Include country code, e.g. +55 11 99999-9999")}</p>
                    </div>
                  )}

                  {currentField?.key === "password" && (
                    <div className="space-y-2">
                      <Label htmlFor="fld-password" className="text-sm font-medium">{t("Password")}</Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="fld-password"
                          autoFocus
                          data-tour="reg-password"
                          type={showPw ? "text" : "password"}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="h-12 pl-10 pr-12 text-base tracking-widest"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showPw ? t("Hide password") : t("Show password")}
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("Minimum 6 characters.")}</p>
                    </div>
                  )}

                  {currentField?.key === "organization" && (
                    <div className="space-y-2">
                      <Label htmlFor="fld-org" className="text-sm font-medium">{t("Organization")}</Label>
                      <div className="relative">
                        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="fld-org"
                          autoFocus
                          data-tour="reg-org"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          placeholder={t("e.g. ACME Energy")}
                          className="h-12 pl-10 text-base"
                        />
                      </div>
                    </div>
                  )}

                  {currentField?.key === "country" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-sm font-medium">
                        <Globe2 className="h-4 w-4 text-muted-foreground" /> {t("Country")}
                      </Label>
                      <Select
                        value={country}
                        onValueChange={(v) => { setCountry(v); setState(""); setCity(""); }}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder={t("Select country…")} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.code} className="text-base">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {currentField?.key === "state" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-sm font-medium">
                        <MapPin className="h-4 w-4 text-muted-foreground" /> {t("State / Province")}
                      </Label>
                      <Select
                        value={state}
                        onValueChange={(v) => { setState(v); setCity(""); }}
                        disabled={!country}
                      >
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder={t("Select state…")} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {availableStates.map((s) => (
                            <SelectItem key={s.code} value={s.code} className="text-base">
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {currentField?.key === "city" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-sm font-medium">
                        <MapPin className="h-4 w-4 text-muted-foreground" /> {t("City")}
                      </Label>
                      {availableCities.length > 0 ? (
                        <Select
                          value={city}
                          onValueChange={setCity}
                          disabled={!country || (stateRequired && !state)}
                        >
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder={
                              !country ? t("Select country first…")
                              : stateRequired && !state ? t("Select state first…")
                              : t("Select city…")
                            } />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {availableCities.map((c) => (
                              <SelectItem key={c} value={c} className="text-base">
                                {c}
                              </SelectItem>
                            ))}
                            <SelectItem value="__other__" className="text-base text-muted-foreground">
                              {t("Other…")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder={t("Your city")}
                          className="h-12 text-base"
                          disabled={!country}
                        />
                      )}
                      {city === "__other__" && (
                        <Input
                          autoFocus
                          placeholder={t("Type your city")}
                          className="mt-2 h-12 text-base"
                          onChange={(e) => {
                            if (e.target.value) setCity(e.target.value);
                          }}
                        />
                      )}
                    </div>
                  )}

                  {currentField?.key === "documentType" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["INDIVIDUAL", "COMPANY"] as const).map((opt) => {
                        const active = documentType === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDocumentType(opt)}
                            className={cn(
                              "rounded-lg border p-4 text-left transition-all",
                              active
                                ? "border-primary/60 bg-primary/5 shadow-[var(--shadow-glow)]"
                                : "border-border bg-background/40 hover:border-border/80",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium">
                                {opt === "INDIVIDUAL" ? t("Individual") : t("Company")}
                              </span>
                              <div className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-full border",
                                active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                              )}>
                                {active && <Check className="h-3 w-3" />}
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {opt === "INDIVIDUAL" ? t("CPF (Brazil) or personal tax ID.") : t("CNPJ (Brazil) or company registration ID.")}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {currentField?.key === "documentNumber" && (
                    <div className="space-y-4" data-tour="reg-identity">
                      <div className="space-y-2">
                        <Label htmlFor="fld-doc" className="text-sm font-medium">{docLabel}</Label>
                        <div className="relative">
                          <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="fld-doc"
                            autoFocus
                            value={documentNumber}
                            onChange={(e) => setDocumentNumber(e.target.value)}
                            placeholder={isBrazil ? (documentType === "COMPANY" ? "00.000.000/0000-00" : "000.000.000-00") : t("Tax / registration ID")}
                            className="h-12 pl-10 text-base"
                          />
                        </div>
                        {documentNumber.trim() && !docValid && (
                          <p className="text-xs text-destructive">{docHint}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{t("Leave blank to skip — you can add it later.")}</p>
                      </div>

                      <div>
                        <input
                          id="id-doc"
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.type !== "application/pdf") {
                              toast.error(t("Only PDF files are accepted."));
                              e.target.value = "";
                              return;
                            }
                            if (f.size > 15 * 1024 * 1024) {
                              toast.error(t("File too large — maximum 15 MB."));
                              e.target.value = "";
                              return;
                            }
                            setDocumentFile(f);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor="id-doc"
                          className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/20 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          {documentFile ? `${t("Attached")} · ${documentFile.name}` : t("Attach document · PDF · optional")}
                        </label>
                        {documentFile && (
                          <button
                            type="button"
                            onClick={() => setDocumentFile(null)}
                            className="mt-1 text-xs text-muted-foreground hover:text-destructive"
                          >
                            {t("Remove document")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {currentField?.key === "roles" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{t("Select all that apply")}</Label>
                        <button
                          type="button"
                          onClick={selectAll}
                          className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition hover:text-primary"
                        >
                          {t("Enable all capabilities →")}
                        </button>
                      </div>
                      <div data-tour="reg-roles" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {(Object.keys(ROLE_META) as ParticipantRole[])
                          .filter((r) => r !== "REGULATORY_AUTHORITY" && r !== "ADMIN")
                          .map((r) => {
                            const Icon = ROLE_ICON[r];
                            const active = roles.includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => toggleRole(r)}
                                className={cn(
                                  "group relative overflow-hidden rounded-lg border p-3 text-left transition-all duration-200",
                                  active
                                    ? `${ROLE_COLORS[r].border} ${ROLE_COLORS[r].bg}`
                                    : "border-border bg-background/40 hover:border-border/80 hover:bg-background/60",
                                )}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                                    active
                                      ? `${ROLE_COLORS[r].border} ${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text}`
                                      : "border-border bg-background/60 text-muted-foreground",
                                  )}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className={cn("text-sm font-medium", active && ROLE_COLORS[r].text)}>
                                        {ROLE_META[r].label}
                                      </span>
                                      <div className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded-sm border transition",
                                        active
                                          ? `${ROLE_COLORS[r].border} ${ROLE_COLORS[r].bg} ${ROLE_COLORS[r].text}`
                                          : "border-border bg-background/60",
                                      )}>
                                        {active && <Check className="h-3 w-3" />}
                                      </div>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {ROLE_META[r].tagline}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {roles.length === 0
                          ? t("Select one or more market participant roles.")
                          : `${roles.length} ${roles.length === 1 ? t("capability scoped to identity.") : t("capabilities scoped to identity.")}`}
                      </p>
                    </div>
                  )}

                  {currentField?.key === "energyTypes" && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">{t("Select every generation source you operate — choose as many as apply.")}</Label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {(
                          [
                            { type: "SOLAR",       label: "Solar PV",      Icon: Sun      },
                            { type: "HYDRO",       label: "Hydroelectric", Icon: Droplets },
                            { type: "SMALL_HYDRO", label: "Small Hydro",   Icon: Waves    },
                            { type: "WIND",        label: "Wind",          Icon: Wind     },
                            { type: "BIOMASS",     label: "Biomass",       Icon: Leaf     },
                            { type: "NATURAL_GAS", label: "Natural Gas",   Icon: Flame    },
                            { type: "NUCLEAR",     label: "Nuclear",       Icon: Atom     },
                            { type: "THERMAL",     label: "Thermal",       Icon: Factory  },
                            { type: "COGENERATION",label: "Cogeneration",  Icon: Recycle  },
                          ] as const
                        ).map(({ type, label, Icon }) => {
                          const active = energyTypes.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() =>
                                setEnergyTypes((prev) =>
                                  prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                                )
                              }
                              className={cn(
                                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                                active
                                  ? "border-success/50 bg-success/10 text-success"
                                  : "border-border bg-background/40 text-muted-foreground hover:border-border/80",
                              )}
                            >
                              <Icon className="h-5 w-5" />
                              <span className="text-xs font-medium">{t(label)}</span>
                              <Check className={cn("h-3 w-3 transition-opacity", active ? "opacity-100" : "opacity-0")} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {currentField?.key === "wallet" && (
                    <div className="space-y-4">
                      <label data-tour="reg-fund" className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background/40 p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={fund}
                          onChange={(e) => setFund(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                        />
                        <span>
                          <span className="block text-sm font-medium">
                            {t("Fund settlement account on")} {STELLAR_NETWORK_LABEL}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t("Provisions a Stellar Mainnet account for institutional settlement operations.")}
                          </span>
                        </span>
                      </label>

                      <div data-tour="reg-wallet" className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            { id: "generate" as const, icon: Zap,      label: "EnergyPay Managed Wallet", desc: "Platform generates and securely manages your keypair — secret never exposed in the frontend" },
                            { id: "link"     as const, icon: KeyRound, label: "Link Existing Wallet",     desc: "Provide your public key — you sign each transaction locally, secret never stored" },
                          ] as const
                        ).map((opt) => {
                          const active = walletMode === opt.id;
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setWalletMode(opt.id)}
                              className={cn(
                                "relative overflow-hidden rounded-lg border p-3 text-left transition-all",
                                active
                                  ? "border-primary/60 bg-primary/5 shadow-[var(--shadow-glow)]"
                                  : "border-border bg-background/40 hover:border-border/80",
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={cn(
                                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                                  active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background/60 text-muted-foreground",
                                )}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{t(opt.label)}</span>
                                    <div className={cn(
                                      "flex h-4 w-4 items-center justify-center rounded-full border",
                                      active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                                    )}>
                                      {active && <Check className="h-3 w-3" />}
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">{t(opt.desc)}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {walletMode === "link" && (
                        <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
                          <Label htmlFor="fld-pubkey" className="text-sm font-medium">{t("Stellar Public Key (G…)")}</Label>
                          <div className="relative">
                            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="fld-pubkey"
                              value={existingPublicKey}
                              onChange={(e) => setExistingPublicKey(e.target.value.trim())}
                              placeholder="G…"
                              className="h-12 pl-10 font-mono text-sm"
                              maxLength={58}
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </div>
                          {existingPublicKey && (existingPublicKey.length !== 56 || !existingPublicKey.startsWith("G")) && (
                            <p className="text-xs text-destructive">
                              {t("Must be a 56-character Stellar public key starting with G")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {t("EnergyPay never stores, requests or transmits your secret key. When a transaction requires your signature, an unsigned XDR will be presented in a local signing modal — you enter your secret key, it signs in memory, and the signed transaction is sent directly to Stellar. Your secret never leaves your device.")}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {currentField?.key === "review" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border bg-background/40 p-4">
                        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                          {[
                            { label: t("Full Name"),     value: fullName },
                            { label: t("Operator Email"),value: email },
                            { label: t("Phone"),         value: phone },
                            { label: t("Organization"), value: organization },
                            { label: t("Country"),      value: country },
                            stateRequired && { label: t("State / Province"), value: state },
                            { label: t("City"),          value: city },
                            { label: t("Identity Type"),value: documentType === "COMPANY" ? t("Company") : t("Individual") },
                            documentNumber.trim() && { label: docLabel.replace(` ${t("(optional)")}`, ""), value: documentNumber },
                            { label: t("Roles"),        value: roles.join(" · ") || "—" },
                            roles.includes("GENERATOR") && { label: t("Generation"), value: energyTypes.join(" · ") || "—" },
                            { label: t("Wallet"),       value: walletMode === "generate" ? t("EnergyPay managed wallet") : t("User-controlled wallet") },
                          ].filter(Boolean).map((row) => (
                            <div key={(row as { label: string }).label} className="flex justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
                              <span className="text-xs uppercase tracking-widest text-muted-foreground">{(row as { label: string }).label}</span>
                              <span className="truncate text-right text-sm font-medium text-foreground">{(row as { value: string }).value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("Confirming will mint your settlement identity, bind your ed25519 keypair and register your roles on Stellar Mainnet. After that we send a verification email.")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Wizard navigation */}
              <div className="flex items-center gap-3 pt-1">
                {safeStep > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goBack}
                    className="h-10 shrink-0 font-mono text-xs uppercase tracking-widest"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> {t("Back")}
                  </Button>
                )}
                <Button
                  type="submit"
                  data-tour="reg-continue"
                  disabled={safeStep === visibleFields.length - 1 ? !formValid : (!currentField?.valid && !currentField?.optional)}
                  className="h-10 flex-1 font-mono text-xs uppercase tracking-widest"
                >
                  {safeStep === visibleFields.length - 1 ? t("Provision Settlement Identity") : t("Continue")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>{t("Already provisioned?")}</span>
                <Link to="/login" className="text-foreground hover:text-primary">
                  {t("Operator Access →")}
                </Link>
              </div>
            </form>
          )}

          {step === "provisioning" && (
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[11px] uppercase tracking-widest text-foreground">
                  {t("Provisioning Settlement Identity")}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {progress}/{provisioningSteps.length}
                </div>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
                <div
                  className="h-full bg-[image:var(--gradient-primary)] transition-all duration-300"
                  style={{ width: `${(progress / provisioningSteps.length) * 100}%` }}
                />
              </div>
              <div className="space-y-1.5 rounded-md border border-border bg-background/60 p-3 font-mono text-[11px]">
                {provisioningSteps.map((s, i) => {
                  const done = i < progress;
                  const active = i === progress;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="w-7 text-muted-foreground">
                        [{String(i + 1).padStart(2, "0")}]
                      </span>
                      {done ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : active ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <span className="h-3 w-3 rounded-full border border-border" />
                      )}
                      <span
                        className={
                          done
                            ? "text-foreground"
                            : active
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }
                      >
                        {t(s)}
                      </span>
                      {done && <span className="ml-auto text-[10px] text-success">{t("OK")}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>{t("Network:")} {STELLAR_NETWORK_LABEL}</span>
                <span className="flex items-center gap-1.5 text-success">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />{" "}
                  {t("Provisioning")}
                </span>
              </div>
            </div>
          )}

          {step === "verify-email" && (
            // Phone verification is optional (event policy): email-verified users get
            // straight into the environment. Phone OTP stays available but is not required.
            <VerifyEmailStep onVerified={() => setStep("success")} />
          )}

          {step === "verify-phone" && (
            <VerifyPhoneStep
              hasPhone={!!phone.trim()}
              onVerified={() => setStep("success")}
            />
          )}

          {step === "success" && operator && (
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-success/40 bg-success/10 text-success">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-success">
                    {t("Settlement Identity Active")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {operator.operatorId} · {operator.organization}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/60 p-3">
                <KeyRow
                  label={t("Public Key")}
                  value={operator.wallet.publicKey}
                  icon={<ShieldCheck className="h-3 w-3" />}
                />
                <Separator className="my-2 bg-border/60" />
                <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("Signer custody")}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-foreground">
                    {operator.wallet.walletMode === "USER_CONTROLLED" ? t("User-controlled wallet") : t("EnergyPay managed wallet")} · ed25519 ·{" "}
                    {operator.wallet.status}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {operator.wallet.walletMode === "USER_CONTROLLED"
                      ? t("Your public key is registered. Secret key never stored by EnergyPay — you sign each transaction locally.")
                      : t("Secret key is encrypted with AES-256 and stored by EnergyPay. The frontend never receives or transmits the secret key.")}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/60 p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("Network Settlement Receipt")}
                </div>
                <div className="mt-2 grid gap-2">
                  <KeyRow
                    label={t("Provisioning Tx Hash")}
                    value={operator.provisioningTxHash || t("PENDING · awaiting backend confirmation")}
                    icon={<Terminal className="h-3 w-3" />}
                  />
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-widest">
                    <Mini
                      label={t("Ledger Sequence")}
                      value={
                        operator.provisioningLedger != null
                          ? `#${operator.provisioningLedger}`
                          : t("PENDING")
                      }
                      tone={operator.provisioningLedger != null ? "success" : undefined}
                    />
                    <Mini
                      label={t("Settlement Status")}
                      value={(
                        operator.settlementStatus ||
                        operator.wallet.status ||
                        "PROVISIONED"
                      ).toUpperCase()}
                      tone={operator.wallet.funded ? "success" : undefined}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-widest">
                <Mini
                  label={t("Network")}
                  value={operator.network || STELLAR_NETWORK_LABEL}
                  tone="success"
                />
                <Mini
                  label={t("Funded")}
                  value={operator.wallet.funded ? t("Yes") : t("No · Pending")}
                  tone={operator.wallet.funded ? "success" : undefined}
                />
                <Mini label={t("Roles")} value={operator.roles.length.toString()} />
                <Mini label={t("Address")} value={maskAddress(operator.wallet.publicKey)} />
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {t("Provisioned Capabilities")}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {operator.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary"
                    >
                      {ROLE_META[r].label}
                    </span>
                  ))}
                </div>
              </div>

              <a
                href={stellarExpertAccount(operator.wallet.publicKey)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <span>{t("Audit account on Stellar Expert")}</span>
                <ArrowRight className="h-3 w-3" />
              </a>

              <Button
                onClick={() => navigate({ to: "/" })}
                className="h-10 w-full font-mono text-xs uppercase tracking-widest"
              >
                {t("Enter Settlement Control Room")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─── Verify Email Step ─── */
function VerifyEmailStep({ onVerified }: { onVerified: () => void }) {
  const t = useT();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  const resend = async () => {
    setSending(true);
    try {
      const result = await apiResendVerification();
      setSent(true);
      if (result.dev_verify_url) {
        setDevVerifyUrl(result.dev_verify_url);
      } else {
        toast.success(t("Verification email sent — check your inbox."));
      }
    } catch (e) {
      toast.error(safeErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Mail className="h-4 w-4" />
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-foreground">
            {t("Verify Your Email")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t("We sent a verification link to your email address.")}
          </div>
        </div>
      </div>

      {devVerifyUrl && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-warning">
            {t("⚠ Dev mode — email not configured")}
          </p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {t("Resend blocked the email. Open this link directly to verify:")}
          </p>
          <a
            href={devVerifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 break-all font-mono text-[11px] text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {devVerifyUrl}
          </a>
        </div>
      )}

      <div className="rounded-md border border-border bg-background/40 p-4 text-center space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("Click the link in your email to verify your account. After verifying, click the button below to continue.")}
        </p>
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={onVerified}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {t("I've Verified My Email")}
          </Button>
          <Button variant="ghost" size="sm" onClick={resend} disabled={sending || sent}>
            {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
            {sent ? t("Email Sent") : t("Resend Verification Email")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Verify Phone Step ─── */
function VerifyPhoneStep({
  hasPhone,
  onVerified,
}: {
  hasPhone: boolean;
  onVerified: () => void;
}) {
  const t = useT();
  const [phoneInput, setPhoneInput] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(hasPhone);

  const savePhone = async () => {
    if (!phoneInput.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/update-phone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSession()?.token ?? ""}`,
        },
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || t("Failed to save phone"));
      setPhoneSaved(true);
      toast.success(t("Phone number saved."));
    } catch (e) {
      toast.error(safeErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const sendCode = async () => {
    setSending(true);
    try {
      const result = await apiSendPhoneCode();
      setCodeSent(true);
      // Dev fallback: Twilio not configured — code returned in response
      if (result.dev_code) {
        setDevCode(result.dev_code);
      } else {
        toast.success(t("Verification code sent to your phone."));
      }
    } catch (e) {
      toast.error(safeErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      await apiVerifyPhoneCode(code);
      toast.success(t("Phone verified!"));
      onVerified();
    } catch (e) {
      toast.error(safeErrorMessage(e));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Phone className="h-4 w-4" />
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-foreground">
            {t("Verify Your Phone")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t("We'll send a 6-digit code to your phone.")}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/40 p-4 space-y-3">
        {!phoneSaved ? (
          <div className="space-y-2">
            <Label className="text-xs">{t("Phone Number (with country code)")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder="+55 11 99999-9999"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="flex-1 font-mono text-xs"
              />
              <Button size="sm" onClick={savePhone} disabled={sending || !phoneInput.trim()}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("Save")}
              </Button>
            </div>
          </div>
        ) : !codeSent ? (
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("Click below to receive a verification code on your WhatsApp.")}
            </p>
            <Button size="sm" onClick={sendCode} disabled={sending}>
              {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Phone className="mr-1.5 h-3.5 w-3.5" />}
              {t("Send WhatsApp Code")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {devCode && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-warning">
                  {t("⚠ Dev mode — Twilio not configured")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("Your code is:")}{" "}
                  <span className="font-mono font-bold text-foreground">{devCode}</span>
                </p>
              </div>
            )}
            <Label className="text-xs">{t("Enter 6-digit code")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="flex-1 font-mono text-center text-lg tracking-[0.3em]"
                autoFocus
              />
              <Button size="sm" onClick={verify} disabled={verifying || code.length !== 6}>
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={sendCode} disabled={sending}>
              {sending ? t("Sending…") : t("Resend Code")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
  className = "",
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
      {hint && (
        <p className="font-mono text-[9px] text-muted-foreground/70">{hint}</p>
      )}
    </div>
  );
}

/** Lightweight wrapper for Select-based geo fields (no absolute-positioned icon). */
function GeoSelectField({
  label,
  icon,
  children,
  className = "",
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </Label>
      {children}
    </div>
  );
}

function KeyRow({
  label,
  value,
  icon,
  trailing,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const t = useT();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} ${t("copied")}`);
    } catch {
      toast.error(t("Clipboard unavailable"));
    }
  };
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <code className="flex-1 truncate rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          className="h-6 px-2 font-mono text-[10px] uppercase tracking-widest"
        >
          <Copy className="h-3 w-3" />
        </Button>
        {trailing}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-[11px] ${tone === "success" ? "text-success" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ThemeSelector() {
  const t = useT();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {t("§ 04 · Interface Theme")}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(
          [
            { id: "dark" as Theme, icon: Moon, label: "Dark", desc: "Institutional dark mode — reduced eye strain for control room environments" },
            { id: "light" as Theme, icon: Sun, label: "Light", desc: "Clean light interface — high contrast for daylight and presentation use" },
          ] as const
        ).map((opt) => {
          const active = theme === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={`group relative overflow-hidden rounded-md border p-3 text-left transition-all duration-200 ${
                active
                  ? "border-primary/60 bg-primary/5 shadow-[var(--shadow-glow)]"
                  : "border-border bg-background/40 hover:border-border/80 hover:bg-background/60"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                    active
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-background/60 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[11px] uppercase tracking-widest text-foreground">
                      {t(opt.label)}
                    </div>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background/60"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {t(opt.desc)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
        {t("You can change the theme anytime from the Operator Profile menu.")}
      </div>
    </div>
  );
}
