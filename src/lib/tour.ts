/**
 * EnergyPay onboarding guided tour.
 *
 * Floating coach-mark bubbles (driver.js) that point at exactly where the
 * user must click or type — first on the login screen, then field by field
 * through the 4-step registration wizard.
 *
 * The bubbles follow the language the user chose up front: the tour reads the
 * current language from the UI store at start time and renders EN or PT text
 * (proper nouns / technical terms — EnergyPay, Stellar, EPWR, ed25519,
 * "Managed"/"Link" — are kept in English in both).
 *
 * The register tour is a single continuous tour that advances the wizard
 * itself: when the bubble crosses from one wizard step to the next, it flips
 * `formStep` (via the injected setter) and then highlights the next step's
 * field once React has rendered it.
 */
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";
import { useUiStore } from "@/store/ui";

export const LOGIN_TOUR_KEY = "ep_tour_login_v1";
export const REGISTER_TOUR_KEY = "ep_tour_register_v1";

type Lang = "en" | "pt";
type PopoverText = { title: string; description: string };

/** Read the user's chosen language from the UI store (defaults to English). */
function currentLang(): Lang {
  try {
    return useUiStore.getState().lang;
  } catch {
    return "en";
  }
}

/** Only one tour may run at a time — destroy any previous instance first. */
let active: Driver | null = null;

function destroyActive() {
  try {
    active?.destroy();
  } catch {
    /* noop */
  }
  active = null;
}

export function hasSeenTour(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* noop */
  }
}

const BTN = {
  next: { en: "Next →", pt: "Próximo →" },
  prev: { en: "← Back", pt: "← Voltar" },
  done: { en: "Done", pt: "Concluir" },
  gotIt: { en: "Got it", pt: "Entendi" },
  progress: { en: "{{current}} of {{total}}", pt: "{{current}} de {{total}}" },
} as const;

function sharedConfig(lang: Lang, doneText: string) {
  return {
    showProgress: true,
    allowClose: true,
    overlayColor: "#04070e",
    overlayOpacity: 0.9,
    stagePadding: 8,
    stageRadius: 10,
    popoverClass: "ep-tour",
    nextBtnText: BTN.next[lang],
    prevBtnText: BTN.prev[lang],
    doneBtnText: doneText,
    progressText: BTN.progress[lang],
  };
}

/* ─────────────────────────── Login tour ─────────────────────────── */

const LOGIN_STEPS: { element: string; en: PopoverText; pt: PopoverText }[] = [
  {
    element: '[data-tour="login-email"]',
    en: {
      title: "1 · Your email",
      description:
        "Enter the email you registered with — this is how you sign in to the platform.",
    },
    pt: {
      title: "1 · Seu e-mail",
      description:
        "Digite aqui o e-mail que você cadastrou. É com ele que você entra na plataforma.",
    },
  },
  {
    element: '[data-tour="login-password"]',
    en: { title: "2 · Your password", description: "Enter the password you created during sign-up." },
    pt: { title: "2 · Sua senha", description: "Digite a senha criada no cadastro." },
  },
  {
    element: '[data-tour="login-access"]',
    en: {
      title: "3 · Sign in",
      description: "Click here to access the environment. That's it — you're inside the platform.",
    },
    pt: {
      title: "3 · Entrar",
      description: "Clique aqui para acessar o ambiente. Pronto — você está dentro da plataforma.",
    },
  },
  {
    element: '[data-tour="login-provision"]',
    en: {
      title: "First time here?",
      description:
        "No account yet? Click here to create one — we'll guide you step by step through sign-up.",
    },
    pt: {
      title: "Primeira vez aqui?",
      description:
        "Ainda não tem conta? Clique aqui para criar a sua — vamos te guiar passo a passo no cadastro.",
    },
  },
];

export function startLoginTour(): Driver {
  destroyActive();
  const lang = currentLang();
  const d = driver({
    ...sharedConfig(lang, BTN.gotIt[lang]),
    steps: LOGIN_STEPS.map((s) => ({ element: s.element, popover: s[lang] })),
    onDestroyed: () => {
      markSeen(LOGIN_TOUR_KEY);
      active = null;
    },
  });
  active = d;
  d.drive();
  return d;
}

/* ──────────────────────── Registration tour ─────────────────────── */

const REGISTER_STEPS: { page: number; element: string; en: PopoverText; pt: PopoverText }[] = [
  // ── Step 1 · Credentials ──
  {
    page: 0,
    element: '[data-tour="reg-fullname"]',
    en: {
      title: "Step 1 · Credentials",
      description: 'Start with your full name. Fill each field following the tips and move on with "Next".',
    },
    pt: {
      title: "Etapa 1 · Credenciais",
      description: "Comece pelo seu nome completo. Preencha cada campo seguindo as dicas e avance no “Próximo”.",
    },
  },
  {
    page: 0,
    element: '[data-tour="reg-email"]',
    en: {
      title: "Sign-in email",
      description: "Use a valid email — you'll receive a confirmation link there at the end of sign-up.",
    },
    pt: {
      title: "E-mail de acesso",
      description: "Use um e-mail válido — você receberá um link de confirmação nele ao final do cadastro.",
    },
  },
  {
    page: 0,
    element: '[data-tour="reg-phone"]',
    en: { title: "Phone", description: "Include the country code, e.g. +55 11 99999-9999." },
    pt: { title: "Telefone", description: "Inclua o código do país, ex.: +55 11 99999-9999." },
  },
  {
    page: 0,
    element: '[data-tour="reg-password"]',
    en: {
      title: "Password",
      description: "Create a password with at least 6 characters. Use the eye icon to check it.",
    },
    pt: {
      title: "Senha",
      description: "Crie uma senha com no mínimo 6 caracteres. Use o ícone de olho para conferir.",
    },
  },
  // ── Step 2 · Organization & identity ──
  {
    page: 1,
    element: '[data-tour="reg-org"]',
    en: { title: "Step 2 · Organization", description: "Enter your company or organization name." },
    pt: { title: "Etapa 2 · Organização", description: "Informe o nome da sua empresa ou organização." },
  },
  {
    page: 1,
    element: '[data-tour="reg-country"]',
    en: {
      title: "Location",
      description: "Select country, state and city. The options appear based on the country you choose.",
    },
    pt: {
      title: "Localização",
      description: "Selecione país, estado e cidade. As opções aparecem conforme o país escolhido.",
    },
  },
  {
    page: 1,
    element: '[data-tour="reg-identity"]',
    en: {
      title: "Document (optional)",
      description: "Tax ID (CPF/CNPJ) is optional. If you like, attach a PDF of the document — also optional.",
    },
    pt: {
      title: "Documento (opcional)",
      description: "CPF/CNPJ é opcional. Se quiser, anexe um PDF do documento — também opcional.",
    },
  },
  // ── Step 3 · Market roles ──
  {
    page: 2,
    element: '[data-tour="reg-roles"]',
    en: {
      title: "Step 3 · Market roles",
      description:
        "Pick one or more roles (e.g. Generator, Trader, Consumer). They define what you can do on the platform.",
    },
    pt: {
      title: "Etapa 3 · Papéis no mercado",
      description:
        "Escolha um ou mais papéis (ex.: Gerador, Trader, Consumidor). Eles definem o que você pode fazer na plataforma.",
    },
  },
  // ── Step 4 · Settlement setup ──
  {
    page: 3,
    element: '[data-tour="reg-wallet"]',
    en: {
      title: "Step 4 · Settlement wallet",
      description: '"Managed" = EnergyPay handles the wallet for you (recommended). "Link" = use your own Stellar wallet.',
    },
    pt: {
      title: "Etapa 4 · Carteira de liquidação",
      description: "“Managed” = a EnergyPay cuida da carteira para você (recomendado). “Link” = você usa sua própria carteira Stellar.",
    },
  },
  {
    page: 3,
    element: '[data-tour="reg-fund"]',
    en: {
      title: "Fund the account",
      description: "Keep this checked to provision your account on the Stellar network — required to operate.",
    },
    pt: {
      title: "Financiar a conta",
      description: "Deixe marcado para provisionar sua conta na rede Stellar — necessário para operar.",
    },
  },
  {
    page: 3,
    element: '[data-tour="reg-continue"]',
    en: {
      title: "Finish sign-up",
      description: "Review the fields and click here to provision your identity. Then confirm your email and you're done!",
    },
    pt: {
      title: "Concluir cadastro",
      description: "Revise os campos e clique aqui para provisionar sua identidade. Depois, confirme seu e-mail e pronto!",
    },
  },
];

/** Delay (ms) to let React render the next wizard step before highlighting. */
const PAGE_FLIP_DELAY = 220;

export function startRegisterTour({
  setStep,
  onClose,
}: {
  setStep: (step: number) => void;
  onClose?: () => void;
}): Driver {
  destroyActive();
  const lang = currentLang();

  const cleanSteps = REGISTER_STEPS.map((s) => ({ element: s.element, popover: s[lang] }));
  const holder: { d: Driver | null } = { d: null };

  holder.d = driver({
    ...sharedConfig(lang, BTN.done[lang]),
    steps: cleanSteps,
    onNextClick: () => {
      const d = holder.d;
      if (!d) return;
      const i = d.getActiveIndex() ?? 0;
      const cur = REGISTER_STEPS[i];
      const nxt = REGISTER_STEPS[i + 1];
      if (nxt && cur && nxt.page !== cur.page) {
        setStep(nxt.page);
        window.setTimeout(() => d.moveNext(), PAGE_FLIP_DELAY);
      } else {
        d.moveNext();
      }
    },
    onPrevClick: () => {
      const d = holder.d;
      if (!d) return;
      const i = d.getActiveIndex() ?? 0;
      const cur = REGISTER_STEPS[i];
      const prv = REGISTER_STEPS[i - 1];
      if (prv && cur && prv.page !== cur.page) {
        setStep(prv.page);
        window.setTimeout(() => d.movePrevious(), PAGE_FLIP_DELAY);
      } else {
        d.movePrevious();
      }
    },
    onDestroyed: () => {
      markSeen(REGISTER_TOUR_KEY);
      active = null;
      onClose?.();
    },
  });

  active = holder.d;
  // Always begin from the first wizard step, then start once it has painted.
  setStep(0);
  window.setTimeout(() => holder.d?.drive(), 80);
  return holder.d;
}
